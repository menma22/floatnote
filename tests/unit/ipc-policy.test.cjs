const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeSender } = require('../../electron/ipc-policy.cjs');

function fixture(
  kind = 'note',
  url = 'file:///app/dist/index.html?kind=note&id=one',
) {
  const frame = { url };
  const event = { sender: { id: 10, mainFrame: frame }, senderFrame: frame };
  const role = { kind, id: 'one' };
  return {
    event,
    role,
    roles: new Map([[10, role]]),
    url: 'file:///app/dist/index.html',
  };
}

test('note and list roles authorize only their own allowed operations', () => {
  for (const kind of ['note', 'list']) {
    const data = fixture(kind);
    assert.equal(
      authorizeSender(data.event, data.roles, data.url, [kind]),
      data.role,
    );
    assert.equal(
      authorizeSender(data.event, data.roles, data.url, null),
      data.role,
    );
    assert.throws(
      () =>
        authorizeSender(data.event, data.roles, data.url, [
          kind === 'note' ? 'list' : 'note',
        ]),
      /操作できません/,
    );
  }
});

test('unregistered contents, subframes, detached frames and remote documents are denied', () => {
  const data = fixture();
  assert.throws(() => authorizeSender(data.event, new Map(), data.url));
  assert.throws(() =>
    authorizeSender(
      { ...data.event, senderFrame: { url: data.event.senderFrame.url } },
      data.roles,
      data.url,
    ),
  );
  assert.throws(() =>
    authorizeSender({ ...data.event, senderFrame: null }, data.roles, data.url),
  );
  for (const url of [
    'https://example.com',
    'file:///other/index.html',
    'file:///app/dist/index.html-malicious',
  ]) {
    const remote = fixture('note', url);
    assert.throws(() => authorizeSender(remote.event, remote.roles, data.url));
  }
});
