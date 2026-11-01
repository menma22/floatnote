import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
let desktop;
let dataDirectory;
let errors;
const primaryKey = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch() {
  const env = {
    ...process.env,
    FLOATNOTE_TEST_MODE: '1',
    FLOATNOTE_TEST_USER_DATA: dataDirectory,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = await electron.launch({
    ...(process.env.FLOATNOTE_TEST_EXECUTABLE
      ? { executablePath: process.env.FLOATNOTE_TEST_EXECUTABLE, args: [] }
      : { args: [project] }),
    cwd: project,
    env,
  });
  desktop.on('window', (page) =>
    page.on('pageerror', (error) => errors.push(error.message)),
  );
  const page = await desktop.firstWindow();
  await expect(page.locator('[data-testid=titlebar]')).toBeVisible();
  await page.locator('#app').hover({ position: { x: 10, y: 60 } });
  return page;
}

async function quit() {
  await desktop.close();
  desktop = null;
}

async function state(page) {
  return page.evaluate(() => window.floatnote.getInitialState());
}

test.beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'floatnote-e2e-'));
  errors = [];
});

test.afterEach(async () => {
  if (desktop) await quit();
  expect(errors).toEqual([]);
});

test('note headers appear on hover or keyboard navigation without moving the memo', async () => {
  const note = await launch();
  const header = note.getByTestId('titlebar');
  const editor = note.getByRole('textbox', { name: '付箋の本文' });
  await editor.fill('覚えておきたいこと\n'.repeat(25));
  await editor.press('Home');
  await note.locator('.editor-area').evaluate((area) => {
    area.scrollTop = 60;
  });
  const position = () =>
    note.locator('.editor-area').evaluate((area) => ({
      top: area.getBoundingClientRect().top,
      scroll: area.scrollTop,
      text: area.textContent,
    }));
  await note.mouse.move(-20, -20);
  await expect(header).toHaveCSS('opacity', '0');
  await expect(header).toHaveCSS('pointer-events', 'none');
  await expect(editor).toBeFocused();
  const hiddenPosition = await position();
  await note.screenshot({ path: 'test-results/header-hidden.png' });
  await note.locator('#app').hover({ position: { x: 10, y: 60 } });
  await expect(header).toHaveCSS('opacity', '1');
  expect(await position()).toEqual(hiddenPosition);
  await note.screenshot({ path: 'test-results/header-visible.png' });
  await note.getByRole('button', { name: '付箋の色を変更' }).click();
  await expect(note.getByRole('dialog', { name: '付箋の色' })).toBeVisible();
  await note.mouse.move(-20, -20);
  await expect(note.getByRole('dialog', { name: '付箋の色' })).toBeHidden();
  await expect(header).toHaveCSS('opacity', '0');
  await editor.focus();
  await note.keyboard.press('Shift+Tab');
  await expect(note.getByTestId('close-note')).toBeFocused();
  await expect(header).toHaveCSS('opacity', '1');
  await note.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  await expect(header).toHaveCSS('opacity', '0');
  const listWindow = desktop.waitForEvent('window');
  await note.keyboard.press(`${primaryKey}+Shift+l`);
  const list = await listWindow;
  await list.mouse.move(-20, -20);
  await expect(list.getByTestId('titlebar')).toHaveCSS('opacity', '1');
});

test('multiple notes, Markdown, colors, cycles, close/list and restart persistence', async () => {
  let note = await launch();
  expect(desktop.windows()).toHaveLength(1);
  const initialSize = await note.evaluate(() => [
    window.innerWidth,
    window.innerHeight,
  ]);
  expect(Math.abs(initialSize[0] - 340)).toBeLessThanOrEqual(2);
  expect(Math.abs(initialSize[1] - 240)).toBeLessThanOrEqual(2);
  await expect(note.locator('#app')).toHaveAttribute('data-color', 'lime');
  await expect(note.getByTestId('interval-value')).toHaveText('30分');
  const editor = note.getByRole('textbox', { name: '付箋の本文' });
  await editor.fill('**今日の優先事項**');
  await editor.press('Enter');
  await expect(editor.locator('strong')).toHaveText('今日の優先事項');
  await note.screenshot({ path: 'test-results/floatnote-default.png' });
  await editor.fill('- 最初の作業');
  await editor.press('Enter');
  await expect(editor.locator('ul li').first()).toHaveText('最初の作業');
  await editor.press(`${primaryKey}+a`);
  await editor.press('Backspace');
  await editor.fill('1. 最初の作業');
  await editor.press('Enter');
  await expect(editor.locator('ol li').first()).toHaveText('最初の作業');
  await editor.press(`${primaryKey}+a`);
  await editor.press('Backspace');
  await editor.fill('再起動しても残るメモ');
  await note.getByTestId('interval-slider').focus();
  await note.keyboard.press('Home');
  await note.keyboard.press('ArrowRight');
  await note.keyboard.press('ArrowRight');
  await expect(note.getByTestId('interval-value')).toHaveText('15分');
  await note.getByRole('button', { name: '付箋の色を変更' }).click();
  await note.getByTestId('color-blue').click();
  await expect(note.locator('#app')).toHaveAttribute('data-color', 'blue');
  const firstId = (await state(note)).note.id;

  const nextWindow = desktop.waitForEvent('window');
  await note.getByRole('button', { name: '新しい付箋' }).click();
  const second = await nextWindow;
  await expect(second.getByTestId('interval-value')).toHaveText('30分');
  await expect(second.locator('#app')).toHaveAttribute('data-color', 'lime');
  await second
    .getByRole('textbox', { name: '付箋の本文' })
    .fill('もう一枚のメモ');
  await note.getByRole('button', { name: '閉じる' }).click();
  await expect.poll(() => note.isClosed()).toBe(true);

  const listWindow = desktop.waitForEvent('window');
  await second.getByRole('button', { name: '付箋一覧' }).click();
  const list = await listWindow;
  await expect(list.getByTestId('note-row')).toHaveCount(2);
  await list.getByRole('searchbox', { name: '付箋を検索' }).fill('再起動');
  await expect(list.getByTestId('note-row')).toHaveCount(1);
  await expect(list.getByTestId('note-row')).toContainText('閉じています');
  const reopened = desktop.waitForEvent('window');
  await list.getByTestId('note-row').click();
  note = await reopened;
  await expect(note.getByRole('textbox', { name: '付箋の本文' })).toHaveText(
    '再起動しても残るメモ',
  );
  await expect(note.getByTestId('interval-value')).toHaveText('15分');
  await expect(note.locator('#app')).toHaveAttribute('data-color', 'blue');
  await desktop.evaluate(({ app }, id) => {
    app.floatnoteTest.windows
      .get(id)
      .setBounds({ x: 120, y: 120, width: 320, height: 240 });
  }, firstId);
  const layout = await note.getByTestId('titlebar').evaluate((header) => ({
    width: header.clientWidth,
    scrollWidth: header.scrollWidth,
    tops: [...header.querySelectorAll('button, input, output')].map((el) =>
      Math.round(el.getBoundingClientRect().top),
    ),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(Math.max(...layout.tops) - Math.min(...layout.tops)).toBeLessThan(20);
  await note.screenshot({ path: 'test-results/floatnote-note.png' });
  await list.screenshot({ path: 'test-results/floatnote-list.png' });
  await quit();

  const saved = JSON.parse(
    await readFile(path.join(dataDirectory, 'notes.json'), 'utf8'),
  );
  const first = saved.notes.find((item) => item.id === firstId);
  expect(first).toMatchObject({
    text: '再起動しても残るメモ',
    color: 'blue',
    intervalMinutes: 15,
    isOpen: true,
  });
  await launch();
  await expect.poll(() => desktop.windows().length).toBe(2);
  const contents = await Promise.all(desktop.windows().map(state));
  expect(contents.find((item) => item.note.id === firstId).note).toMatchObject(
    first,
  );
  await quit();
});

test('production timer resurfaces minimized notes without stealing typing focus', async () => {
  const note = await launch();
  const initial = await state(note);
  const newCover = desktop.waitForEvent('window');
  await desktop.evaluate(({ BrowserWindow }) => {
    const cover = new BrowserWindow({
      width: 600,
      height: 400,
      title: 'Focus check',
      webPreferences: { sandbox: true },
    });
    void cover.loadURL('data:text/html,<input aria-label="Typing stays here">');
  });
  const coverPage = await newCover;
  await coverPage.setContent('<input aria-label="Typing stays here">');
  await desktop.evaluate(({ app, BrowserWindow }, id) => {
    const noteWindow = app.floatnoteTest.windows.get(id);
    noteWindow.minimize();
    const cover = BrowserWindow.getAllWindows().find(
      (item) => item !== noteWindow,
    );
    cover.show();
    cover.focus();
  }, initial.note.id);
  await coverPage
    .getByRole('textbox', { name: 'Typing stays here' })
    .fill('before');
  await expect
    .poll(() =>
      desktop.evaluate(
        ({ app }, id) => app.floatnoteTest.windows.get(id).isMinimized(),
        initial.note.id,
      ),
    )
    .toBe(true);
  await desktop.evaluate(({ app }, id) => {
    app.floatnoteTest.scheduler.entries.get(id).nextAt = Date.now() + 100;
  }, initial.note.id);
  await expect
    .poll(() =>
      desktop.evaluate(
        ({ app }, id) => app.floatnoteTest.windows.get(id).isMinimized(),
        initial.note.id,
      ),
    )
    .toBe(false);
  const raised = await desktop.evaluate(({ app, BrowserWindow }, id) => {
    const window = app.floatnoteTest.windows.get(id);
    const cover = BrowserWindow.getAllWindows().find((item) => item !== window);
    return {
      visible: window.isVisible(),
      minimized: window.isMinimized(),
      top: window.isAlwaysOnTop(),
      noteFocused: window.isFocused(),
      coverFocused: cover.isFocused(),
    };
  }, initial.note.id);
  expect(raised).toEqual({
    visible: true,
    minimized: false,
    top: true,
    noteFocused: false,
    coverFocused: true,
  });
  await coverPage.keyboard.type(' after');
  await expect(
    coverPage.getByRole('textbox', { name: 'Typing stays here' }),
  ).toHaveValue('before after');
  await expect
    .poll(() =>
      desktop.evaluate(
        ({ app }, id) => app.floatnoteTest.windows.get(id).isAlwaysOnTop(),
        initial.note.id,
      ),
    )
    .toBe(false);
  await desktop.evaluate(({ app, BrowserWindow }, id) => {
    const noteWindow = app.floatnoteTest.windows.get(id);
    BrowserWindow.getAllWindows()
      .find((item) => item !== noteWindow)
      .destroy();
  }, initial.note.id);
  await quit();
});

test('invalid IPC is rejected and closing every note preserves it in the list', async () => {
  const note = await launch();
  await expect(
    note.evaluate(() => window.floatnote.setInterval(0)),
  ).rejects.toThrow();
  await expect(
    note.evaluate(() => window.floatnote.setColor('unknown')),
  ).rejects.toThrow();
  await expect(
    note.evaluate(() =>
      window.floatnote.updateNote({ content: { type: 'script' }, text: 'bad' }),
    ),
  ).rejects.toThrow();
  await note
    .getByRole('textbox', { name: '付箋の本文' })
    .fill('閉じる直前の入力');
  await note.getByRole('button', { name: '閉じる' }).click();
  await expect.poll(() => desktop.windows().length).toBe(0);
  await quit();
  const list = await launch();
  await expect(list.getByTestId('note-row')).toContainText('閉じる直前の入力');
  await expect(list.getByTestId('note-row')).toContainText('閉じています');
  await expect(
    list.evaluate(() =>
      window.floatnote.updateNote({ content: { type: 'doc' }, text: '' }),
    ),
  ).rejects.toThrow();
  await quit();
});

test('macOS native editing, Command shortcuts and Dock activation preserve notes', async () => {
  test.skip(process.platform !== 'darwin', 'Requires macOS native menus.');
  const note = await launch();
  const editor = note.getByRole('textbox', { name: '付箋の本文' });
  await editor.fill('Mac の編集確認');
  await editor.press('Meta+a');
  await editor.press('Meta+c');
  expect(await desktop.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    'Mac の編集確認',
  );
  await editor.press('Meta+x');
  await expect(editor).toHaveText('');
  await editor.press('Meta+v');
  await expect(editor).toHaveText('Mac の編集確認');
  await editor.press('Meta+z');
  await expect(editor).toHaveText('');
  await editor.press('Meta+Shift+z');
  await expect(editor).toHaveText('Mac の編集確認');
  const newNote = desktop.waitForEvent('window');
  await editor.press('Meta+n');
  const second = await newNote;
  await expect(
    second.getByRole('textbox', { name: '付箋の本文' }),
  ).toBeVisible();
  expect(desktop.windows()).toHaveLength(2);
  await second
    .getByRole('textbox', { name: '付箋の本文' })
    .fill('Command W で保存');
  await second.keyboard.press('Meta+w');
  await expect.poll(() => second.isClosed()).toBe(true);
  const listWindow = desktop.waitForEvent('window');
  await note.keyboard.press('Meta+Shift+l');
  const list = await listWindow;
  await expect(list.getByTestId('note-row')).toHaveCount(2);
  expect(desktop.windows()).toHaveLength(2);
  await list.keyboard.press('Meta+w');
  await expect.poll(() => list.isClosed()).toBe(true);
  await note.keyboard.press('Meta+w');
  await expect.poll(() => desktop.windows().length).toBe(0);
  const activated = desktop.waitForEvent('window');
  await desktop.evaluate(({ app }) => {
    app.emit('activate');
  });
  const restoredList = await activated;
  await expect(restoredList.getByTestId('note-row')).toHaveCount(2);
  await expect(
    restoredList
      .getByTestId('note-row')
      .filter({ hasText: 'Command W で保存' }),
  ).toBeVisible();
  const roles = await desktop.evaluate(({ Menu }) => {
    const flatten = (items) =>
      items.flatMap((item) => [
        item.role?.toLowerCase(),
        ...(item.submenu ? flatten(item.submenu.items) : []),
      ]);
    return flatten(Menu.getApplicationMenu().items);
  });
  expect(roles).toEqual(
    expect.arrayContaining(['copy', 'paste', 'undo', 'quit']),
  );
});
