/**
 * System tray module.
 * Creates a tray icon with context menu for minimize-to-tray functionality.
 * All user-facing strings are in Turkish.
 * @module tray
 */

const path = require('path');

let tray = null;
let isQuitting = false;

function createTray(mainWindow, app, deps) {
  const electronModule = (deps && deps.electron) || require('electron');
  const fsModule = (deps && deps.fs) || require('fs');
  const Tray = electronModule.Tray;
  const Menu = electronModule.Menu;

  const iconPath = path.join(__dirname, '..', '..', 'assets', 'phoneFarm.ico');

  if (!fsModule.existsSync(iconPath)) {
    console.warn('[Tray] Ikon bulunamadi:', iconPath, '- tray devre disi');
    return null;
  }

  tray = new Tray(iconPath);
  tray.setToolTip('Phone Farm');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Göster',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.restore();
        }
      }
    },
    {
      label: 'Gizle',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.restore();
      }
    }
  });

  return tray;
}

/**
 * Returns the current tray instance.
 * @returns {Electron.Tray|null}
 */
function getTray() {
  return tray;
}

/**
 * Destroys the tray instance and cleans up.
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, getTray, destroyTray, _resetForTesting: () => { tray = null; isQuitting = false; } };
