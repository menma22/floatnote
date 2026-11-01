import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('packaged Windows executable opens a usable local note', async () => {
  test.skip(
    !process.env.FLOATNOTE_TEST_EXECUTABLE,
    'Requires a built Windows executable.',
  );
  const env = {
    ...process.env,
    FLOATNOTE_TEST_MODE: '1',
    FLOATNOTE_TEST_USER_DATA: await mkdtemp(
      path.join(tmpdir(), 'floatnote-package-'),
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.FLOATNOTE_TEST_EXECUTABLE,
    args: [],
    env,
  });
  try {
    const note = await app.firstWindow();
    const editor = note.getByRole('textbox', { name: '付箋の本文' });
    await expect(editor).toBeVisible();
    await expect(note.locator('#app')).toHaveAttribute('data-color', 'lime');
    await expect(note.locator('#app')).toHaveCSS(
      'background-color',
      'rgb(239, 255, 201)',
    );
    await expect(note.getByTestId('interval-value')).toHaveText('30分');
    await note.getByRole('button', { name: '最大化', exact: true }).click();
    await expect(
      note.getByRole('button', { name: '元のサイズに戻す' }),
    ).toBeVisible();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isMaximized(),
      ),
    ).toBe(true);
    await note.getByRole('button', { name: '元のサイズに戻す' }).click();
    await expect(
      note.getByRole('button', { name: '最大化', exact: true }),
    ).toBeVisible();
    await editor.fill('今日の優先事項');
    const state = await note.evaluate(() => window.floatnote.getInitialState());
    expect(state.note.text).toBe('今日の優先事項');
    await expect(note.getByTestId('save-error')).toBeHidden();
    await note.screenshot({ path: 'docs/images/floatnote.png' });
  } finally {
    await app.close();
  }
});
