const test = require('node:test');
const assert = require('node:assert/strict');
const { applicationMenuTemplate } = require('../../electron/platform-menu.cjs');

test('Windows and Linux keep the frameless app without an application menu', () => {
  for (const platform of ['win32', 'linux'])
    assert.equal(applicationMenuTemplate(platform, {}), null);
});

test('macOS uses native application, editing and window roles with close routed through the window lifecycle', () => {
  const template = applicationMenuTemplate('darwin', {});
  assert.deepEqual(
    template.filter((item) => item.role).map((item) => item.role),
    ['appMenu', 'editMenu', 'windowMenu'],
  );
  assert.equal(template[1].submenu.at(-1).role, 'close');
});

test('macOS new note and list menu shortcuts invoke the existing actions', () => {
  const calls = [];
  const template = applicationMenuTemplate('darwin', {
    newNote: () => calls.push('new'),
    openList: () => calls.push('list'),
  });
  const [newNote, openList] = template[1].submenu;
  assert.equal(newNote.accelerator, 'CmdOrCtrl+N');
  assert.equal(openList.accelerator, 'CmdOrCtrl+Shift+L');
  newNote.click();
  openList.click();
  assert.deepEqual(calls, ['new', 'list']);
});
