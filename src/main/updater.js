// =====================================================
// PHONE FARM V2 - AUTO-UPDATE MANAGER
// =====================================================

const { app, dialog, Menu, MenuItem } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logger
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Settings keys
const SETTINGS_KEY = 'update-settings';
const DEFAULT_SETTINGS = {
  autoCheck: true,
  channel: 'stable' // stable, beta, latest
};

// Load settings from electron-store
const Store = require('electron-store');
const updateStore = new Store({ name: SETTINGS_KEY });

// Get stored settings or use defaults
function getSettings() {
  const stored = updateStore.get();
  return {
    autoCheck: stored.autoCheck !== undefined ? stored.autoCheck : DEFAULT_SETTINGS.autoCheck,
    channel: stored.channel || DEFAULT_SETTINGS.channel
  };
}

// Save settings
function saveSettings(settings) {
  updateStore.set(settings);
}

// Initialize auto-updater
function init() {
  // Set update channel based on settings
  const settings = getSettings();
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://update.phonefarm.sergio.dev/${settings.channel}/`,
    headers: {
      'User-Agent': `PhoneFarm/${app.getVersion()}`
    }
  });

  // Check for updates on app ready if auto-check is enabled
  if (settings.autoCheck) {
    app.whenReady().then(() => {
      // Delay check slightly to let app initialize
      setTimeout(() => {
        checkForUpdates();
      }, 5000);
    });
  }

  // Set up update events
  setupUpdateEvents();

  // Create update menu template
  const updateMenuTemplate = {
    label: 'Updates',
    submenu: [
      {
        label: 'Check for Updates',
        click: () => checkForUpdates(),
        accelerator: 'CmdOrCtrl+Shift+U'
      },
      {
        label: 'Update Settings',
        click: () => {
          // Send IPC to renderer to open settings modal and focus on update tab
          const { BrowserWindow } = require('electron');
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            win.webContents.send('open-settings-tab', 'updates');
          }
        }
      }
    ]
  };

  // Add to application menu if on macOS, otherwise we'll add via IPC later
  if (process.platform === 'darwin') {
    const menu = Menu.getApplicationMenu();
    if (menu) {
      menu.append(new MenuItem(updateMenuTemplate));
    }
  }
}

// Check for updates manually
function checkForUpdates() {
  log.info('Checking for updates...');
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('Error checking for updates:', err);
    // Silent fail as per requirements - don't crash on network failure
  });
}

// Set up autoUpdater event handlers
function setupUpdateEvents() {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    const settings = getSettings();
    // Notify user about available update
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('update-available', info);
    }
    // Show notification dialog
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version ${info.version} is available. Do you want to update now?`,
      buttons: ['Update', 'Later']
    }).then((result) => {
      if (result.response === 0) { // Update button clicked
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    // Optionally notify user that they're on latest version
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('update-not-available', info);
    }
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    // Silent fail - don't crash on network failure
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('update-error', err.message);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    log.info('Download progress:', progressObj.percent);
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('update-download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.send('update-downloaded', info);
    }
    // Ask user to install and restart
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Update ${info.version} has been downloaded. It will be installed on restart. Restart now?`,
      buttons: ['Restart', 'Later']
    }).then((result) => {
      if (result.response === 0) { // Restart button clicked
        setImmediate(() => autoUpdater.quitAndInstall());
      }
    });
  });
}

// Expose functions for use in main.js
module.exports = {
  init,
  checkForUpdates,
  getSettings,
  saveSettings
};