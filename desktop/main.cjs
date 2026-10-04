const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const GAME = 'https://china-chaos.onrender.com';
let mainWindow;
let updateStarted = false;

function sendUpdate(status, extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('china-chaos-update',{detail:${JSON.stringify({ status, ...extra })}}))`).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    autoHideMenuBar: true,
    backgroundColor: '#09070a',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true }
  });

  mainWindow.loadURL(GAME);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(GAME) || url.startsWith('https://discord.com/')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!app.isPackaged || updateStarted) return;
    updateStarted = true;
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 1200);
  });
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => sendUpdate('checking'));
autoUpdater.on('update-available', info => sendUpdate('available', { version: info.version }));
autoUpdater.on('update-not-available', info => sendUpdate('current', { version: info?.version || app.getVersion() }));
autoUpdater.on('download-progress', p => sendUpdate('downloading', { percent: Math.round(p.percent || 0) }));
autoUpdater.on('update-downloaded', async info => {
  sendUpdate('ready', { version: info.version });
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'China Chaos Update bereit',
    message: `Version ${info.version} wurde heruntergeladen.`,
    detail: 'China Chaos kann jetzt neu gestartet werden, um das Update zu installieren.',
    buttons: ['Jetzt neu starten', 'Später'],
    defaultId: 0,
    cancelId: 1
  });
  if (result.response === 0) autoUpdater.quitAndInstall(false, true);
});
autoUpdater.on('error', err => {
  console.error('Auto-Update:', err?.message || err);
  sendUpdate('error');
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
