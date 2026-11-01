const { contextBridge, ipcRenderer } = require('electron');

const pendingUpdates = new Set();
const isNoteWindow =
  new URLSearchParams(window.location.search).get('kind') === 'note';
let contentRevision = 0;
let contentFailure = null;
function invoke(channel, ...args) {
  return ipcRenderer.invoke(`floatnote:${channel}`, ...args);
}
function update(channel, payload) {
  const promise = invoke(channel, payload);
  if (channel === 'update-note' && isNoteWindow) {
    const revision = ++contentRevision;
    promise.then(
      () => {
        if (revision === contentRevision) contentFailure = null;
      },
      () => {
        if (revision === contentRevision) contentFailure = true;
      },
    );
  }
  pendingUpdates.add(promise);
  promise.then(
    () => pendingUpdates.delete(promise),
    () => pendingUpdates.delete(promise),
  );
  return promise;
}
function subscribe(channel, callback) {
  if (typeof callback !== 'function')
    throw new TypeError('A callback is required.');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(`floatnote:${channel}`, listener);
  return () => ipcRenderer.removeListener(`floatnote:${channel}`, listener);
}

ipcRenderer.on('floatnote:prepare-close', async (_event, token) => {
  if (document.documentElement) document.documentElement.inert = true;
  await Promise.allSettled([...pendingUpdates]);
  ipcRenderer.send('floatnote:close-ready', token, !contentFailure);
});
ipcRenderer.on('floatnote:cancel-close', () => {
  if (document.documentElement) document.documentElement.inert = false;
});

contextBridge.exposeInMainWorld(
  'floatnote',
  Object.freeze({
    getInitialState: () => invoke('initial-state'),
    createNote: () => invoke('create-note'),
    openList: () => invoke('open-list'),
    openNote: (id) => invoke('open-note', id),
    updateNote: (payload) => update('update-note', payload),
    setInterval: (minutes) => update('set-interval', minutes),
    setColor: (color) => update('set-color', color),
    minimize: () => invoke('minimize'),
    toggleMaximize: () => invoke('toggle-maximize'),
    closeWindow: () => invoke('close-window'),
    onNotesChanged: (callback) => subscribe('notes-changed', callback),
    onResurface: (callback) => subscribe('resurface', callback),
    onError: (callback) => subscribe('error', callback),
  }),
);
