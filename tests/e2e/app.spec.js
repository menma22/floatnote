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
  await editor.press('Control+a');
  await editor.press('Backspace');
  await editor.fill('1. 最初の作業');
  await editor.press('Enter');
  await expect(editor.locator('ol li').first()).toHaveText('最初の作業');
  await editor.press('Control+a');
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
