function applicationMenuTemplate(platform, { newNote, openList }) {
  if (platform !== 'darwin') return null;
  return [
    { role: 'appMenu' },
    {
      label: 'ファイル',
      submenu: [
        {
          label: '新しい付箋',
          accelerator: 'CmdOrCtrl+N',
          click: newNote,
        },
        {
          label: '付箋一覧',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: openList,
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
}

module.exports = { applicationMenuTemplate };
