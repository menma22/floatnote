const { app, BrowserWindow, Menu } = require('electron');

app.setName('Floatnote focus check');
app.setPath('userData', process.env.FLOATNOTE_FOCUS_TEST_USER_DATA);
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 600,
    height: 400,
    title: 'Focus check',
    webPreferences: { sandbox: true },
  });
  void window.loadURL('data:text/html,<input aria-label="Typing stays here">');
});
app.on('window-all-closed', () => app.quit());
