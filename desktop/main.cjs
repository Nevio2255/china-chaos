const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// ============================================================
// CHINA CHAOS DESKTOP
// ============================================================

// ?desktop=1 sagt der Webseite:
// "Ich laufe bereits in der installierten Windows-App."
const GAME_URL = 'https://china-chaos.onrender.com/?desktop=1';

let mainWindow = null;
let updateStarted = false;


// ============================================================
// UPDATE-STATUS AN WEBSEITE SENDEN
// ============================================================

function sendUpdate(status, extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

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


// ============================================================
// HAUPTFENSTER
// ============================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,

    minWidth: 1000,
    minHeight: 650,

    title: 'China Chaos',

    autoHideMenuBar: true,

    backgroundColor: '#09070a',

    // Dein Icon liegt hier:
    // desktop/build/icon.ico
    icon: path.join(
      __dirname,
      'build',
      'icon.ico'
    ),

    show: false,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });


  // ==========================================================
  // SPIEL LADEN
  // ==========================================================

  mainWindow.loadURL(GAME_URL);


  // Fenster erst anzeigen, wenn die Seite bereit ist
  mainWindow.once(
    'ready-to-show',
    () => {
      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
        return;
      }

      mainWindow.show();
      mainWindow.focus();
    }
  );


  // ==========================================================
  // LINKS
  // ==========================================================

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      try {
        const target =
          new URL(url);

        const gameOrigin =
          new URL(GAME_URL).origin;


        // China-Chaos-Seiten intern öffnen
        if (
          target.origin === gameOrigin
        ) {
          return {
            action: 'allow'
          };
        }


        // Discord darf ebenfalls geöffnet werden
        if (
          target.hostname === 'discord.com' ||
          target.hostname.endsWith(
            '.discord.com'
          )
        ) {
          return {
            action: 'allow'
          };
        }


        // Andere Links im normalen Browser
        shell.openExternal(url);

        return {
          action: 'deny'
        };

      } catch (error) {

        console.error(
          'Ungültiger Link:',
          error
        );

        return {
          action: 'deny'
        };
      }
    }
  );


  // ==========================================================
  // DESKTOP-MODUS BEI NAVIGATION BEIBEHALTEN
  // ==========================================================

  mainWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      try {
        const target =
          new URL(url);

        const gameOrigin =
          new URL(GAME_URL).origin;


        if (
          target.origin !== gameOrigin
        ) {
          return;
        }


        // Download-Seite darf innerhalb der EXE
        // niemals angezeigt werden.
        if (
          target.pathname.startsWith(
            '/download'
          )
        ) {
          event.preventDefault();

          mainWindow.loadURL(
            GAME_URL
          );
        }

      } catch {
        // Ignorieren
      }
    }
  );


  // ==========================================================
  // AUTO-UPDATE STARTEN
  // ==========================================================

  mainWindow.webContents.on(
    'did-finish-load',
    () => {

      // Bei lokalem Electron-Test keine Updates prüfen
      if (!app.isPackaged) {
        console.log(
          'Development-Modus: Auto-Update deaktiviert.'
        );

        return;
      }


      // Nur einmal pro App-Start prüfen
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

            sendUpdate(
              'error'
            );

          });

      }, 1500);
    }
  );


  mainWindow.on(
    'closed',
    () => {
      mainWindow = null;
    }
  );
}


// ============================================================
// AUTO-UPDATER EINSTELLUNGEN
// ============================================================

autoUpdater.autoDownload = true;

autoUpdater.autoInstallOnAppQuit = true;


// ============================================================
// UPDATE WIRD GESUCHT
// ============================================================

autoUpdater.on(
  'checking-for-update',
  () => {

    console.log(
      'Suche nach Update...'
    );

    sendUpdate(
      'checking'
    );
  }
);


// ============================================================
// UPDATE VERFÜGBAR
// ============================================================

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


// ============================================================
// KEIN UPDATE
// ============================================================

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


// ============================================================
// DOWNLOAD-FORTSCHRITT
// ============================================================

autoUpdater.on(
  'download-progress',
  (progress) => {

    const percent =
      Math.round(
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


// ============================================================
// UPDATE HERUNTERGELADEN
// ============================================================

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


    if (
      result.response === 0
    ) {

      console.log(
        'China Chaos wird für das Update neu gestartet...'
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


// ============================================================
// UPDATE-FEHLER
// ============================================================

autoUpdater.on(
  'error',
  (error) => {

    console.error(
      'China Chaos Auto-Update Fehler:',
      error?.stack ||
      error?.message ||
      error
    );


    sendUpdate(
      'error'
    );
  }
);


// ============================================================
// ELECTRON START
// ============================================================

app.whenReady().then(
  () => {
    createWindow();
  }
);


// ============================================================
// APP SCHLIESSEN
// ============================================================

app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !== 'darwin'
    ) {
      app.quit();
    }
  }
);


// ============================================================
// MACOS RE-ACTIVATE
// ============================================================

app.on(
  'activate',
  () => {

    if (
      BrowserWindow
        .getAllWindows()
        .length === 0
    ) {
      createWindow();
    }
  }
);
