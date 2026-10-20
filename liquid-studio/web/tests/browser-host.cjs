const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1440, height: 1000, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadURL(process.env.LIQUID_TEST_URL || 'http://localhost:4173');
});
app.on('window-all-closed', () => app.quit());
