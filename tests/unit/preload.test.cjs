const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const source = fs.readFileSync(
  path.join(__dirname, '../../electron/preload.cjs'),
  'utf8',
);
function fixture({ kind = 'note', invoke = () => Promise.resolve() } = {}) {
  const ipc = new EventEmitter();
  const sent = [];
  let api;
  const document = { documentElement: { inert: false } };
  ipc.invoke = invoke;
  ipc.send = (...args) => sent.push(args);
  vm.runInNewContext(source, {
    require: (module) => {
      assert.equal(module, 'electron');
      return {
        ipcRenderer: ipc,
        contextBridge: {
          exposeInMainWorld: (name, value) => {
            assert.equal(name, 'floatnote');
            api = value;
          },
        },
      };
    },
    window: { location: { search: `?kind=${kind}` } },
    document,
    URLSearchParams,
  });
  return { api, ipc, sent, document };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

test('native close waits for the latest pending content update before acknowledging', async () => {
  let finish;
  const data = fixture({
    invoke: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = data.api.updateNote({ content: {}, text: 'latest' });
  data.ipc.emit('floatnote:prepare-close', {}, 'token');
  await settled();
  assert.equal(data.document.documentElement.inert, true);
  assert.deepEqual(data.sent, []);
  finish();
  await pending;
  await settled();
  assert.deepEqual(data.sent, [['floatnote:close-ready', 'token', true]]);
});

test('a rejected content update blocks native close until a later successful content update', async () => {
  let rejectContent = true;
  const data = fixture({
    invoke: () =>
      rejectContent
        ? Promise.reject(new Error('too large'))
        : Promise.resolve(),
  });
  await assert.rejects(data.api.updateNote({ content: {}, text: 'oversized' }));
  data.ipc.emit('floatnote:prepare-close', {}, 'first');
  await settled();
  assert.deepEqual(data.sent, [['floatnote:close-ready', 'first', false]]);
  data.ipc.emit('floatnote:cancel-close');
  assert.equal(data.document.documentElement.inert, false);
  rejectContent = false;
  await data.api.updateNote({ content: {}, text: 'corrected' });
  data.ipc.emit('floatnote:prepare-close', {}, 'second');
  await settled();
  assert.deepEqual(data.sent[1], ['floatnote:close-ready', 'second', true]);
});

test('invalid color/interval requests and forbidden list edits cannot poison the close handshake', async () => {
  for (const kind of ['note', 'list']) {
    const data = fixture({
      kind,
      invoke: () => Promise.reject(new Error('invalid')),
    });
    await assert.rejects(data.api.setInterval(0));
    await assert.rejects(data.api.setColor('unknown'));
    if (kind === 'list') await assert.rejects(data.api.updateNote({}));
    data.ipc.emit('floatnote:prepare-close', {}, kind);
    await settled();
    assert.deepEqual(data.sent, [['floatnote:close-ready', kind, true]]);
  }
});

test('a slower old request cannot erase failure of the newest edit', async () => {
  const requests = [];
  const data = fixture({
    invoke: () =>
      new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  const old = data.api.updateNote({ text: 'old' });
  const latest = data.api.updateNote({ text: 'latest' });
  requests[1].reject(new Error('too large'));
  await assert.rejects(latest);
  requests[0].resolve();
  await old;
  data.ipc.emit('floatnote:prepare-close', {}, 'token');
  await settled();
  assert.deepEqual(data.sent, [['floatnote:close-ready', 'token', false]]);
});

test('subscriptions expose values only and unsubscribe from their own listener', () => {
  const data = fixture();
  const calls = [];
  const remove = data.api.onError((message) => calls.push(message));
  data.ipc.emit('floatnote:error', { sender: 'private' }, 'save failed');
  remove();
  data.ipc.emit('floatnote:error', {}, 'later');
  assert.deepEqual(calls, ['save failed']);
  assert.equal(Object.isFrozen(data.api), true);
  assert.equal('ipcRenderer' in data.api, false);
});
