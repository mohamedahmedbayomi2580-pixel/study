const { app, BrowserWindow } = require('electron');
const path = require('path');
function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, backgroundColor: '#E9EEF5',
    autoHideMenuBar: true, title: 'study.ai',
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
