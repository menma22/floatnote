import { createNoteEditor } from './editor.js';
import './style.css';

const api = window.floatnote;
const app = document.querySelector('#app');
const disposers = [];
const pending = new Set();
let editor;
let status;
let statusKind;

const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  minimize: '<path d="M5 15.5h14"/>',
  maximize: '<rect x="5.5" y="5.5" width="13" height="13" rx=".5"/>',
  restore: '<path d="M8 5h11v11M5 8h11v11H5z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  color: '<circle cx="12" cy="12" r="6.5" fill="var(--note-background)"/>',
};

const colors = [
  ['lime', 'ライム'],
  ['sage', 'セージ'],
  ['blue', 'ブルー'],
  ['rose', 'ローズ'],
  ['lavender', 'ラベンダー'],
  ['gray', 'グレー'],
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(icon, label, action, testId) {
  const button = element(
    'button',
    `icon-button ${icon === 'close' ? 'close-button' : ''}`,
  );
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  if (testId) button.dataset.testid = testId;
  setIcon(button, icon);
  button.addEventListener('click', action);
  return button;
}

function setIcon(button, icon) {
  button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
}

function showError(error, kind = 'action') {
  const message = error instanceof Error ? error.message : String(error);
  statusKind = kind;
  status.textContent = message || '操作を完了できませんでした。';
  status.hidden = false;
}

function clearSaveError() {
  if (statusKind === 'save') {
    status.textContent = '';
    status.hidden = true;
  }
}

function request(action, kind = 'action') {
  let promise;
  try {
    promise = Promise.resolve(action());
  } catch (error) {
    showError(error, kind);
    return Promise.resolve(false);
  }
  const tracked = promise
    .then(
      () => true,
      (error) => {
        showError(error, kind);
        return false;
      },
    )
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
  return tracked;
}

async function drainRequests() {
  while (pending.size) await Promise.all([...pending]);
}

function makeShell(kind) {
  app.className = `app ${kind}-app`;
  const header = element('header', 'titlebar');
  header.dataset.testid = 'titlebar';
  const body = element('main', kind === 'note' ? 'editor-area' : 'list-area');
  status = element('div', 'status-message');
  status.hidden = true;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.dataset.testid = 'save-error';
  app.replaceChildren(header, body, status);
  return { header, body };
}

function addWindowControls(header, onClose) {
  const controls = element('div', 'window-controls');
  const minimize = iconButton(
    'minimize',
    '最小化',
    () => request(() => api.minimize()),
    'minimize',
  );
  const maximize = iconButton(
    'maximize',
    '最大化',
    async () => {
      try {
        const maximized = await api.toggleMaximize();
        const label = maximized ? '元のサイズに戻す' : '最大化';
        setIcon(maximize, maximized ? 'restore' : 'maximize');
        maximize.setAttribute('aria-label', label);
        maximize.title = label;
      } catch (error) {
        showError(error);
      }
    },
    'maximize',
  );
  const close = iconButton(
    'close',
    '閉じる',
    () => onClose(close),
    'close-note',
  );
  controls.append(minimize, maximize, close);
  header.append(controls);
}

function renderNote(note) {
  document.title = 'Floatnote';
  const { header, body } = makeShell('note');
  app.dataset.color = note.color || 'lime';
  const actions = element('div', 'note-actions');
  actions.append(
    iconButton(
      'plus',
      '新しい付箋',
      () => request(() => api.createNote()),
      'new-note',
    ),
    iconButton(
      'list',
      '付箋一覧',
      () => request(() => api.openList()),
      'open-list',
    ),
  );
  const leftGap = element('div', 'drag-space');
  const interval = element('div', 'interval-control');
  const slider = element('input', 'interval-slider');
  slider.type = 'range';
  slider.min = '5';
  slider.max = '120';
  slider.step = '5';
  slider.value = String(note.intervalMinutes);
  slider.setAttribute('aria-label', '手前に戻る周期（分）');
  slider.dataset.testid = 'interval-slider';
  const value = element(
    'output',
    'interval-value',
    `${note.intervalMinutes}分`,
  );
  value.dataset.testid = 'interval-value';
  interval.append(slider, value);
  interval.title = 'この周期で、付箋を手前へ戻します';
  header.append(actions, leftGap, interval, element('div', 'drag-space'));

  let latestContent;
  let contentRevision = 0;
  let savedContentRevision = 0;
  let intervalRevision = 0;
  let savedIntervalRevision = 0;
  let colorRevision = 0;
  let savedColorRevision = 0;
  let closing = false;

  function allSaved() {
    return (
      savedContentRevision === contentRevision &&
      savedIntervalRevision === intervalRevision &&
      savedColorRevision === colorRevision
    );
  }

  function saveContent(payload) {
    latestContent = payload;
    const revision = ++contentRevision;
    return request(() => api.updateNote(payload), 'save').then((saved) => {
      if (saved)
        savedContentRevision = Math.max(savedContentRevision, revision);
      if (allSaved()) clearSaveError();
      return saved;
    });
  }

  function saveInterval() {
    const revision = ++intervalRevision;
    return request(() => api.setInterval(Number(slider.value)), 'save').then(
      (saved) => {
        if (saved)
          savedIntervalRevision = Math.max(savedIntervalRevision, revision);
        if (allSaved()) clearSaveError();
        return saved;
      },
    );
  }

  function saveColor() {
    const revision = ++colorRevision;
    return request(() => api.setColor(app.dataset.color), 'save').then(
      (saved) => {
        if (saved) savedColorRevision = Math.max(savedColorRevision, revision);
        if (allSaved()) clearSaveError();
        return saved;
      },
    );
  }

  const palette = element('div', 'color-palette');
  palette.id = 'note-colors';
  palette.hidden = true;
  palette.setAttribute('role', 'dialog');
  palette.setAttribute('aria-label', '付箋の色');
  const colorButton = iconButton(
    'color',
    '付箋の色を変更',
    () => {
      palette.hidden = !palette.hidden;
      colorButton.setAttribute('aria-expanded', String(!palette.hidden));
      if (!palette.hidden)
        (
          palette.querySelector('[aria-pressed="true"]') ||
          palette.querySelector('button')
        ).focus();
    },
    'note-color',
  );
  colorButton.setAttribute('aria-haspopup', 'dialog');
  colorButton.setAttribute('aria-expanded', 'false');
  colorButton.setAttribute('aria-controls', palette.id);
  const closePalette = () => {
    palette.hidden = true;
    colorButton.setAttribute('aria-expanded', 'false');
  };
  for (const [color, label] of colors) {
    const swatch = element('button', 'color-swatch');
    swatch.type = 'button';
    swatch.dataset.color = color;
    swatch.dataset.testid = `color-${color}`;
    swatch.setAttribute('aria-label', label);
    swatch.setAttribute('aria-pressed', String(app.dataset.color === color));
    swatch.title = label;
    swatch.addEventListener('click', () => {
      app.dataset.color = color;
      for (const option of palette.children) {
        option.setAttribute(
          'aria-pressed',
          String(option.dataset.color === color),
        );
      }
      saveColor();
      closePalette();
      colorButton.focus();
    });
    palette.append(swatch);
  }
  const dismissPalette = (event) => {
    if (!palette.contains(event.target) && !colorButton.contains(event.target))
      closePalette();
  };
  const escapePalette = (event) => {
    if (event.key === 'Escape' && !palette.hidden) {
      closePalette();
      colorButton.focus();
      event.preventDefault();
    }
  };
  document.addEventListener('pointerdown', dismissPalette);
  document.addEventListener('keydown', escapePalette);
  app.addEventListener('pointerleave', closePalette);
  disposers.push(() =>
    document.removeEventListener('pointerdown', dismissPalette),
  );
  disposers.push(() => document.removeEventListener('keydown', escapePalette));
  disposers.push(() => app.removeEventListener('pointerleave', closePalette));
  actions.append(colorButton);
  app.append(palette);

  slider.addEventListener('input', () => {
    value.textContent = `${slider.value}分`;
    slider.setAttribute('aria-valuetext', `${slider.value}分`);
    saveInterval();
  });
  slider.setAttribute('aria-valuetext', `${slider.value}分`);

  addWindowControls(header, async (close) => {
    if (closing) return;
    closing = true;
    close.disabled = true;
    slider.disabled = true;
    colorButton.disabled = true;
    closePalette();
    editor.setEditable(false, false);
    const restoreEditing = () => {
      close.disabled = false;
      slider.disabled = false;
      colorButton.disabled = false;
      editor.setEditable(true, false);
      closing = false;
    };
    await drainRequests();
    if (savedContentRevision < contentRevision)
      await saveContent(latestContent);
    if (savedIntervalRevision < intervalRevision) await saveInterval();
    if (savedColorRevision < colorRevision) await saveColor();
    if (!allSaved()) {
      restoreEditing();
      return;
    }
    try {
      await api.closeWindow();
    } catch (error) {
      showError(error, 'save');
      restoreEditing();
    }
  });

  editor = createNoteEditor(body, note.content, saveContent);
  disposers.push(
    api.onResurface(() => {
      app.classList.remove('resurfaced');
      void app.offsetWidth;
      app.classList.add('resurfaced');
    }),
  );
}

function noteSummary(note) {
  const lines = note.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    title: lines[0] || '無題の付箋',
    excerpt:
      lines.slice(1).join(' ') ||
      (lines.length ? '' : 'まだ何も書かれていません'),
  };
}

function renderList(initialNotes) {
  document.title = '付箋一覧 · Floatnote';
  const { header, body } = makeShell('list');
  header.append(element('span', 'list-title', '付箋一覧'));
  const search = element('input', 'search-input');
  search.type = 'search';
  search.placeholder = '検索';
  search.setAttribute('aria-label', '付箋を検索');
  search.dataset.testid = 'search-notes';
  header.append(
    search,
    iconButton(
      'plus',
      '新しい付箋',
      () => request(() => api.createNote()),
      'new-note',
    ),
  );
  addWindowControls(header, async () => {
    await drainRequests();
    request(() => api.closeWindow());
  });

  let notes = initialNotes;
  function drawNotes() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = notes.filter((note) =>
      note.text.toLocaleLowerCase().includes(query),
    );
    body.replaceChildren();
    if (!matches.length) {
      body.append(
        element(
          'p',
          'empty-list',
          query
            ? '一致する付箋がありません'
            : '付箋はまだありません。＋で作成できます。',
        ),
      );
      return;
    }
    const list = element('ul', 'notes-list');
    for (const note of matches) {
      const { title, excerpt } = noteSummary(note);
      const item = element('li', 'note-list-item');
      const row = element('button', 'note-row');
      row.dataset.color = note.color || 'lime';
      row.type = 'button';
      row.dataset.noteId = note.id;
      row.dataset.testid = 'note-row';
      row.setAttribute(
        'aria-label',
        `${title}、${note.intervalMinutes}分、${note.isOpen ? '表示中' : '閉じています'}`,
      );
      const copy = element('span', 'note-row-copy');
      copy.append(element('span', 'note-row-title', title));
      if (excerpt) copy.append(element('span', 'note-row-excerpt', excerpt));
      const meta = element('span', 'note-row-meta');
      const open = element(
        'span',
        `open-state ${note.isOpen ? 'is-open' : ''}`,
        note.isOpen ? '表示中' : '閉じています',
      );
      meta.append(
        element('span', 'note-row-interval', `${note.intervalMinutes}分`),
        open,
      );
      row.append(copy, meta);
      row.addEventListener('click', () => request(() => api.openNote(note.id)));
      item.append(row);
      list.append(item);
    }
    body.append(list);
  }
  search.addEventListener('input', drawNotes);
  disposers.push(
    api.onNotesChanged((updatedNotes) => {
      notes = updatedNotes;
      drawNotes();
    }),
  );
  drawNotes();
}

async function start() {
  if (!api)
    throw new Error(
      '付箋の保存機能に接続できません。アプリを起動し直してください。',
    );
  const initial = await api.getInitialState();
  if (initial.kind === 'note') renderNote(initial.note);
  else if (initial.kind === 'list') renderList(initial.notes);
  else throw new Error('付箋の情報を読み込めませんでした。');
  disposers.push(api.onError((message) => showError(message, 'save')));
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.isComposing || event.altKey)
      return;
    if (event.code === 'KeyN' && !event.shiftKey) {
      event.preventDefault();
      request(() => api.createNote());
    } else if (event.code === 'KeyL' && event.shiftKey) {
      event.preventDefault();
      request(() => api.openList());
    }
  });
}

window.addEventListener(
  'beforeunload',
  () => {
    editor?.destroy();
    for (const dispose of disposers) dispose();
  },
  { once: true },
);

start().catch((error) => {
  app.className = 'app failed-app';
  const message = element(
    'p',
    'startup-error',
    error.message || '付箋を起動できませんでした。',
  );
  message.setAttribute('role', 'alert');
  app.replaceChildren(message);
});
