const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  screen,
  powerMonitor,
  session,
  dialog,
} = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const {
  createNote,
  validateUpdate,
  validateInterval,
  validateColor,
  validateId,
  clampBounds,
  MIN_WIDTH,
  MIN_HEIGHT,
} = require('./model.cjs');
const { NoteStore } = require('./store.cjs');
const { NoteScheduler } = require('./scheduler.cjs');
const { authorizeSender } = require('./ipc-policy.cjs');
const { readNormalBounds } = require('./window-state.cjs');

const testMode = process.env.FLOATNOTE_TEST_MODE === '1';
if (testMode && process.env.FLOATNOTE_TEST_USER_DATA)
  app.setPath('userData', path.resolve(process.env.FLOATNOTE_TEST_USER_DATA));
app.setName('Floatnote');
const ownsInstance = testMode || app.requestSingleInstanceLock();
const windows = new Map();
const roles = new Map();
const closingWindows = new Set();
const pendingDrains = new Map();
const topmostTimers = new Map();
let listWindow = null;
let tray = null;
let store;
let scheduler;
let quitting = false;
let preparingQuit = false;
let lastSaveError = '';
const root = path.join(__dirname, '..');
const rendererPath = path.join(root, 'dist', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;

function notes() {
  return store.state.notes;
}
function findNote(id) {
  const note = notes().find((item) => item.id === id);
  if (!note) throw new Error('付箋が見つかりません。');
  return note;
}
function send(window, channel, value) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(`floatnote:${channel}`, value);
}
function reportError(error) {
  const message =
    error instanceof Error ? error.message : '操作を完了できません。';
  for (const window of BrowserWindow.getAllWindows())
    send(window, 'error', message);
  if (
    !BrowserWindow.getAllWindows().some((window) => window.isVisible()) &&
    message !== lastSaveError
  ) {
    dialog.showErrorBox('Floatnote — 保存エラー', message);
  }
  lastSaveError = message;
}
function changed() {
  store.changed();
  send(listWindow, 'notes-changed', notes());
}
function clearTopmost(id) {
  const timer = topmostTimers.get(id);
  if (timer) clearTimeout(timer);
  topmostTimers.delete(id);
}
function captureBounds(window, note) {
  note.bounds = readNormalBounds(window, note.bounds);
}
function secureWindow(window, role) {
  const contentsId = window.webContents.id;
  roles.set(contentsId, { ...role, window });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('render-process-gone', () =>
    reportError(
      new Error(
        '画面が停止しました。保存済みのメモは保持されています。一覧から付箋を開き直してください。',
      ),
    ),
  );
  window.on('closed', () => {
    roles.delete(contentsId);
    closingWindows.delete(window.id);
  });
}
function windowOptions(bounds, title) {
  return {
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title,
    icon: path.join(root, 'assets', 'icon.png'),
    frame: false,
    show: false,
    backgroundColor: '#efffc9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      devTools: testMode,
    },
  };
}
function drainRenderer(window) {
  if (
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isCrashed() ||
    !roles.has(window.webContents.id)
  )
    return Promise.resolve();
  const token = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingDrains.delete(token);
      reject(
        new Error(
          '画面から保存完了を確認できません。内容を保護するため終了を中止しました。',
        ),
      );
    }, 3000);
    pendingDrains.set(token, {
      sender: window.webContents,
      resolve: (success) => {
        clearTimeout(timer);
        if (success) resolve();
        else
          reject(
            new Error(
              '保存できていない本文があります。内容を保護するため終了を中止しました。本文を修正してから、もう一度閉じてください。',
            ),
          );
      },
    });
    send(window, 'prepare-close', token);
  });
}
async function closeNoteWindow(window, note) {
  if (closingWindows.has(window.id)) return;
  closingWindows.add(window.id);
  try {
    await drainRenderer(window);
    if (window.isDestroyed()) return;
    captureBounds(window, note);
    note.isOpen = false;
    changed();
    try {
      store.flush();
    } catch (error) {
      note.isOpen = true;
      changed();
      throw error;
    }
    scheduler.close(note.id);
    clearTopmost(note.id);
    windows.delete(note.id);
    setImmediate(() => {
      if (!window.isDestroyed()) window.destroy();
    });
  } catch (error) {
    closingWindows.delete(window.id);
    send(window, 'cancel-close');
    reportError(error);
    throw error;
  }
}
function openNoteWindow(note, { focus = true } = {}) {
  let window = windows.get(note.id);
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    if (focus) window.focus();
    return window;
  }
  const bounds = clampBounds(
    note.bounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  window = new BrowserWindow(windowOptions(bounds, 'Floatnote'));
  window.setBounds(bounds);
  captureBounds(window, note);
  windows.set(note.id, window);
  secureWindow(window, { kind: 'note', id: note.id });
  note.isOpen = true;
  scheduler.open(note.id, note.intervalMinutes);
  changed();
  window.once('ready-to-show', () => {
    if (focus) window.show();
    else window.showInactive();
  });
  window.on('move', () => {
    captureBounds(window, note);
    changed();
  });
  window.on('resize', () => {
    captureBounds(window, note);
    changed();
  });
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (!preparingQuit) void closeNoteWindow(window, note).catch(() => {});
  });
  window.on('closed', () => {
    clearTopmost(note.id);
    if (windows.get(note.id) === window) windows.delete(note.id);
  });
  window
    .loadFile(rendererPath, { query: { kind: 'note', id: note.id } })
    .catch(reportError);
  return window;
}
function openList() {
  if (listWindow && !listWindow.isDestroyed()) {
    if (listWindow.isMinimized()) listWindow.restore();
    listWindow.show();
    listWindow.focus();
    return listWindow;
  }
  listWindow = new BrowserWindow(
    windowOptions({ width: 520, height: 580 }, 'Floatnote — 付箋一覧'),
  );
  secureWindow(listWindow, { kind: 'list' });
  listWindow.once('ready-to-show', () => listWindow?.show());
  listWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (!preparingQuit) {
      try {
        store.flush();
        listWindow.destroy();
      } catch (error) {
        reportError(error);
      }
    }
  });
  listWindow.on('closed', () => {
    listWindow = null;
  });
  listWindow
    .loadFile(rendererPath, { query: { kind: 'list' } })
    .catch(reportError);
  return listWindow;
}
function newNote() {
  const note = createNote();
  notes().push(note);
  openNoteWindow(note);
  return note;
}
function resurfaceNote(id) {
  const window = windows.get(id);
  if (!window || window.isDestroyed() || closingWindows.has(window.id)) return;
  clearTopmost(id);
  // showInactive also unhides a minimized Windows window without activating it.
  window.setAlwaysOnTop(true, 'floating');
  window.showInactive();
  window.moveTop();
  send(window, 'resurface');
  const timer = setTimeout(() => {
    topmostTimers.delete(id);
    if (!window.isDestroyed()) window.setAlwaysOnTop(false);
  }, 1000);
  topmostTimers.set(id, timer);
}
function senderRole(event, allowed) {
  return authorizeSender(event, roles, rendererUrl, allowed);
}
function handle(channel, allowed, action) {
  ipcMain.handle(`floatnote:${channel}`, (event, ...args) => {
    const role = senderRole(event, allowed);
    if (args.length !== Math.max(0, action.length - 1))
      throw new Error('操作の引数が不正です。');
    if (
      preparingQuit &&
      !['update-note', 'set-interval', 'set-color'].includes(channel)
    )
      throw new Error('保存して終了しています。');
    return action(role, ...args);
  });
}
function setupIpc() {
  ipcMain.on('floatnote:close-ready', (event, token, success) => {
    const pending = pendingDrains.get(token);
    if (
      pending?.sender === event.sender &&
      event.senderFrame === event.sender.mainFrame
    ) {
      pendingDrains.delete(token);
      pending.resolve(success === true);
    }
  });
  handle('initial-state', null, (role) =>
    role.kind === 'note'
      ? { kind: 'note', note: findNote(role.id) }
      : { kind: 'list', notes: notes() },
  );
  handle('create-note', null, () => newNote());
  handle('open-list', null, () => {
    openList();
  });
  handle('open-note', ['list'], (_role, id) => {
    validateId(id);
    openNoteWindow(findNote(id));
  });
  handle('update-note', ['note'], (role, payload) => {
    validateUpdate(payload);
    const note = findNote(role.id);
    note.content = structuredClone(payload.content);
    note.text = payload.text;
    note.updatedAt = new Date().toISOString();
    changed();
  });
  handle('set-interval', ['note'], (role, minutes) => {
    validateInterval(minutes);
    const note = findNote(role.id);
    note.intervalMinutes = minutes;
    note.updatedAt = new Date().toISOString();
    scheduler.setInterval(role.id, minutes);
    changed();
  });
  handle('set-color', ['note'], (role, color) => {
    validateColor(color);
    const note = findNote(role.id);
    note.color = color;
    note.updatedAt = new Date().toISOString();
    changed();
  });
  handle('minimize', null, (role) => {
    role.window.minimize();
  });
  handle('toggle-maximize', null, (role) => {
    if (role.window.isMaximized()) role.window.unmaximize();
    else role.window.maximize();
    return role.window.isMaximized();
  });
  handle('close-window', null, (role) => {
    if (role.kind === 'note')
      return closeNoteWindow(role.window, findNote(role.id));
    store.flush();
    role.window.destroy();
  });
}
async function prepareQuit() {
  if (preparingQuit || quitting) return;
  preparingQuit = true;
  try {
    await Promise.all(BrowserWindow.getAllWindows().map(drainRenderer));
    for (const [id, window] of windows) captureBounds(window, findNote(id));
    store.changed();
    store.flush();
    quitting = true;
    scheduler.stop();
    for (const id of topmostTimers.keys()) clearTopmost(id);
    tray?.destroy();
    app.quit();
  } catch (error) {
    preparingQuit = false;
    for (const window of BrowserWindow.getAllWindows())
      send(window, 'cancel-close');
    reportError(error);
  }
}

if (!ownsInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (store) openList();
  });
  app.on('window-all-closed', () => {});
  app.on('activate', () => {
    if (store && BrowserWindow.getAllWindows().length === 0) openList();
  });
  app.on('before-quit', (event) => {
    if (!store || quitting) return;
    event.preventDefault();
    void prepareQuit();
  });
  app
    .whenReady()
    .then(() => {
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        callback({
          cancel: !details.url.startsWith(pathToFileURL(root + path.sep).href),
        });
      });
      store = new NoteStore(path.join(app.getPath('userData'), 'notes.json'), {
        onError: reportError,
      });
      let firstRun;
      try {
        ({ firstRun } = store.load());
      } catch (error) {
        dialog.showErrorBox(
          'Floatnote — 保存データを開けません',
          `${error.message}\n\n${store.filePath}`,
        );
        quitting = true;
        app.quit();
        return;
      }
      scheduler = new NoteScheduler({
        onDue: (id) => {
          try {
            resurfaceNote(id);
          } catch (error) {
            reportError(error);
          }
        },
      });
      setupIpc();
      Menu.setApplicationMenu(null);
      if (!testMode) {
        tray = new Tray(path.join(root, 'assets', 'tray.png'));
        tray.setToolTip('Floatnote');
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: '新しい付箋', click: () => newNote() },
            { label: '付箋一覧', click: () => openList() },
            { type: 'separator' },
            { label: '終了', click: () => app.quit() },
          ]),
        );
        tray.on('click', () => openList());
      }
      if (firstRun) newNote();
      else {
        for (const note of notes())
          if (note.isOpen) openNoteWindow(note, { focus: false });
        if (windows.size === 0) openList();
      }
      try {
        store.flush();
      } catch (error) {
        reportError(error);
      }
      scheduler.start();
      powerMonitor.on('resume', () => scheduler.tick());
      if (testMode)
        app.floatnoteTest = {
          windows,
          store,
          scheduler,
          resurfaceNote,
          openList,
          quit: prepareQuit,
          get listWindow() {
            return listWindow;
          },
        };
    })
    .catch((error) => {
      dialog.showErrorBox('Floatnote — 起動エラー', error.message);
      quitting = true;
      app.quit();
    });
}
