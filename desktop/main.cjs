const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const GAME_URL = 'https://china-chaos.onrender.com';

let mainWindow = null;
let updateStarted = false;

function sendUpdate(status, extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const data = JSON.stringify({
    status,
    ...extra
  });

  mainWindow.webContents
    .executeJavaScript(`
      window.dispatchEvent(
        new CustomEvent('china-chaos-update', {
          detail: ${data}
        })
      );
    `)
    .catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,

    minWidth: 1000,
    minHeight: 650,

    title: 'China Chaos',

    autoHideMenuBar: true,

    backgroundColor: '#09070a',

    // ICON:
    // desktop/build/icon.ico
    icon: path.join(__dirname, 'build', 'icon.ico'),

    show: false,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(GAME_URL);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      const gameOrigin = new URL(GAME_URL).origin;

      if (target.origin === gameOrigin) {
        return {
          action: 'allow'
        };
      }

      if (
        target.hostname === 'discord.com' ||
        target.hostname.endsWith('.discord.com')
      ) {
        return {
          action: 'allow'
        };
      }

      shell.openExternal(url);

      return {
        action: 'deny'
      };
    } catch {
      return {
        action: 'deny'
      };
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!app.isPackaged) {
      console.log(
        'Development-Modus: Auto-Update deaktiviert.'
      );

      return;
    }

    if (updateStarted) {
      return;
    }

    updateStarted = true;

    setTimeout(() => {
      console.log(
        'Suche nach China Chaos Updates...'
      );

      autoUpdater
        .checkForUpdates()
        .catch((error) => {
          console.error(
            'Update-Prüfung fehlgeschlagen:',
            error?.message || error
          );

          sendUpdate('error');
        });
    }, 1500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


// ============================================================
// AUTO UPDATE
// ============================================================

autoUpdater.autoDownload = true;

autoUpdater.autoInstallOnAppQuit = true;


autoUpdater.on(
  'checking-for-update',
  () => {
    console.log(
      'Suche nach Update...'
    );

    sendUpdate('checking');
  }
);


autoUpdater.on(
  'update-available',
  (info) => {
    console.log(
      `Neue China Chaos Version gefunden: ${info.version}`
    );

    sendUpdate(
      'available',
      {
        version: info.version
      }
    );
  }
);


autoUpdater.on(
  'update-not-available',
  (info) => {
    const version =
      info?.version ||
      app.getVersion();

    console.log(
      `China Chaos ist aktuell: ${version}`
    );

    sendUpdate(
      'current',
      {
        version
      }
    );
  }
);


autoUpdater.on(
  'download-progress',
  (progress) => {
    const percent = Math.round(
      progress?.percent || 0
    );

    console.log(
      `Update Download: ${percent}%`
    );

    sendUpdate(
      'downloading',
      {
        percent
      }
    );
  }
);


autoUpdater.on(
  'update-downloaded',
  async (info) => {
    console.log(
      `China Chaos ${info.version} wurde heruntergeladen.`
    );

    sendUpdate(
      'ready',
      {
        version: info.version
      }
    );

    if (
      !mainWindow ||
      mainWindow.isDestroyed()
    ) {
      return;
    }

    const result =
      await dialog.showMessageBox(
        mainWindow,
        {
          type: 'info',

          title:
            'China Chaos Update bereit',

          message:
            `China Chaos ${info.version} ist bereit.`,

          detail:
            'Das Update wurde vollständig heruntergeladen. ' +
            'Starte China Chaos jetzt neu, um die neue Version zu installieren.',

          buttons: [
            'Jetzt neu starten',
            'Später'
          ],

          defaultId: 0,
          cancelId: 1,
          noLink: true
        }
      );

    if (result.response === 0) {
      console.log(
        'Update wird installiert...'
      );

      setImmediate(() => {
        autoUpdater.quitAndInstall(
          false,
          true
        );
      });
    }
  }
);


autoUpdater.on(
  'error',
  (error) => {
    console.error(
      'China Chaos Auto-Update Fehler:',
      error?.stack ||
      error?.message ||
      error
    );

    sendUpdate('error');
  }
);


// ============================================================
// ELECTRON APP
// ============================================================

app.whenReady().then(() => {
  createWindow();
});


app.on(
  'window-all-closed',
  () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
);


app.on(
  'activate',
  () => {
    if (
      BrowserWindow.getAllWindows().length === 0
    ) {
      createWindow();
    }
  }
);
