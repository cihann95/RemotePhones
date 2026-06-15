/**
 * System tray module.
 * Creates a tray icon with context menu for minimize-to-tray functionality.
 * All user-facing strings are in Turkish.
 * @module tray
 */

const path = require('path');

let tray = null;
let isQuitting = false;

/**
 * Returns a Turkish status label based on device connection state.
 * @param {Function} getStatusFn - Optional function that returns true if devices connected
 * @returns {string} "Durum: Bağlı" or "Durum: Bağlantı Yok"
 */
function getStatusLabel(getStatusFn) {
  const connected = typeof getStatusFn === 'function' ? getStatusFn() : false;
  return connected ? 'Durum: Bağlı' : 'Durum: Bağlantı Yok';
}

/**
 * Builds the tray context menu template.
 * @param {BrowserWindow} mainWindow
 * @param {Electron.App} app
 * @param {Function} getStatusFn - Returns true if devices are connected
 * @returns {Array} Menu template array
 */
function buildMenuTemplate(mainWindow, app, getStatusFn) {
  return [
    {
      label: "Phone Farm'ı Göster",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.restore();
        }
      }
    },
    {
      label: getStatusLabel(getStatusFn),
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Yeniden Başlat',
      click: () => {
        isQuitting = true;
        app.relaunch();
        app.exit(0);
      }
    },
    {
      label: 'Kapat',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
}

function createTray(mainWindow, app, deps, getStatusFn) {
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

  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(mainWindow, app, getStatusFn)));

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
 * Rebuilds and refreshes the tray context menu (e.g., after device state changes).
 * Call this to update the dynamic status label in the menu.
 * @param {BrowserWindow} mainWindow
 * @param {Electron.App} app
 * @param {Function} getStatusFn
 */
function refreshTrayMenu(mainWindow, app, getStatusFn) {
  if (!tray) return;
  const electron = require('electron');
  const Menu = electron.Menu;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(mainWindow, app, getStatusFn)));
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

module.exports = { createTray, getTray, destroyTray, refreshTrayMenu, getStatusLabel, _resetForTesting: () => { tray = null; isQuitting = false; } };
