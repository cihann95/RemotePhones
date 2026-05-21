// =====================================================
// PHONE FARM V2 - UNIFIED APPLICATION
// Main Process Entry Point
// by SERGIO
// =====================================================

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Import managers
const ADBManager = require('./adb');
const ScrcpyManager = require('./scrcpy');
const ParsecManager = require('./parsec');
const TailscaleManager = require('./tailscale');
const DeviceMonitor = require('./devices');
const DeviceStore = require('./device-store');
const AutostartManager = require('./autostart');
const NotificationManager = require('./notifications');
const ShortcutManager = require('./shortcuts');
const LicenseManager = require('./license');
const Paths = require('./paths');
const { ipcDeviceId, ipcDeviceText } = require('./ipc-validators');

// Version from package.json
const appPkg = require(path.join(__dirname, '..', 'package.json'));
const APP_VERSION = appPkg.version;

// =====================================================
// GLOBAL STATE
// =====================================================

let mainWindow = null;
let aboutWindow = null;
let currentMode = null; // 'home' or 'office'
let isFarmRunning = false;
let isLicenseValid = false;

// Initialize managers
const adbManager = new ADBManager();
const scrcpyManager = new ScrcpyManager();
const parsecManager = new ParsecManager();
const tailscaleManager = new TailscaleManager();
const deviceStore = new DeviceStore();
const autostartManager = new AutostartManager();
const notificationManager = new NotificationManager();
const shortcutManager = new ShortcutManager();
let deviceMonitor = null;

// App settings store
const appStore = new Store({
  name: 'app-settings',
  defaults: {
    setupCompleted: false,
    homeComputerName: '',
    lastMode: null
  }
});

// Make mainWindow globally accessible for scrcpy events
global.mainWindow = null;

// =====================================================
// WINDOW MANAGEMENT
// =====================================================

function createWindow() {
  const fs = require('fs');

  // Icon path - check if exists
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'phoneFarm.ico');
  const hasIcon = fs.existsSync(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    title: 'Phone Farm - SERGIO',
    show: false,
    ...(hasIcon && { icon: iconPath })
  });

  global.mainWindow = mainWindow;

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    if (autostartManager.shouldStartMinimized()) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  // Load appropriate screen based on license status
  if (isLicenseValid) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'license.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    global.mainWindow = null;
  });

  return mainWindow;
}

function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true,
    title: 'Hakkinda - Phone Farm',
    parent: mainWindow,
    modal: true
  });

  aboutWindow.loadFile(path.join(__dirname, '..', 'renderer', 'about.html'));

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

// =====================================================
// APP LIFECYCLE
// =====================================================

app.whenReady().then(async () => {
  if (process.env?.DEBUG) console.log('[App] Starting Phone Farm...');
  if (process.env?.DEBUG) console.log('[App] App packaged:', app.isPackaged);

  // Log all paths for debugging
  Paths.logPaths();

  // Check license first
  if (process.env?.DEBUG) console.log('[App] Checking license...');
  try {
    const licenseResult = await LicenseManager.checkLicense();
    isLicenseValid = licenseResult.isValid;
    if (process.env?.DEBUG) console.log('[App] License valid:', isLicenseValid);
  } catch (e) {
    console.error('[App] License check error:', e.message);
    isLicenseValid = false;
  }

  // Create window
  createWindow();

  // If license is valid, start normal services
  if (isLicenseValid) {
    await startAppServices();
  }

  // Register shortcuts
  shortcutManager.registerAll();
});

// Start app services (ADB, device monitoring)
async function startAppServices() {
  if (process.env?.DEBUG) console.log('[App] ========== START APP SERVICES ==========');

  // Start ADB server
  try {
    if (process.env?.DEBUG) console.log('[App] Starting ADB server...');
    const adbResult = await adbManager.startServer();
    if (process.env?.DEBUG) console.log('[App] ADB server start result:', adbResult);
  } catch (e) {
    console.error('[App] ADB start error:', e.message);
  }

  // Initialize device monitor
  if (process.env?.DEBUG) console.log('[App] Creating DeviceMonitor...');
  deviceMonitor = new DeviceMonitor(adbManager, autostartManager, scrcpyManager);
  if (process.env?.DEBUG) console.log('[App] DeviceMonitor created');

  // Device events
  deviceMonitor.on('devices-changed', (devices) => {
    if (process.env?.DEBUG) console.log('[App] devices-changed event, count:', devices.length);
    try { mainWindow?.webContents?.send('devices-updated', devices); } catch(e) { /* window gone */ }
  });

  deviceMonitor.on('device-connected', (device) => {
    if (process.env?.DEBUG) console.log('[App] device-connected event:', device.id);
    notificationManager.deviceConnected(device);
    try { mainWindow?.webContents?.send('device-connected', device); } catch(e) { /* window gone */ }
  });

  deviceMonitor.on('device-disconnected', (device) => {
    if (process.env?.DEBUG) console.log('[App] device-disconnected event:', device.id);
    notificationManager.deviceDisconnected(device);
    try { mainWindow?.webContents?.send('device-disconnected', device); } catch(e) { /* window gone */ }
  });

  // Start device monitoring
  if (process.env?.DEBUG) console.log('[App] Starting DeviceMonitor...');
  deviceMonitor.start();
  if (process.env?.DEBUG) console.log('[App] ========== APP SERVICES STARTED ==========');
}

app.on('window-all-closed', () => {
  // Quit the app when all windows are closed
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  // Clean up LexActivator resources
  try {
    await LicenseManager.cleanup();
  } catch (e) {
    console.error('[App] License cleanup error:', e.message);
  }

  // Stop all scrcpy processes
  await scrcpyManager.stopAll();

  // Stop device monitor
  if (deviceMonitor) {
    deviceMonitor.stop();
  }

  // Unregister shortcuts
  shortcutManager.unregisterAll();
});

// =====================================================
// IPC: LICENSE
// =====================================================

/**
 * IPC: Checks whether a valid licence is present on disk.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{isValid:boolean,type?:string,expiryDate?:string,gracePeriodDays?:number,error?:string}>}
 */
ipcMain.handle('check-license', async () => {
  if (process.env?.DEBUG) console.log('[IPC] check-license called');
  const result = await LicenseManager.checkLicense();
  isLicenseValid = result.isValid;
  return result;
});

/**
 * IPC: Activates a licence key and persists it.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} licenseKey - The licence key string
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('activate-license', async (event, licenseKey) => {
  if (process.env?.DEBUG) console.log('[IPC] activate-license called');
  const result = await LicenseManager.activateLicense(licenseKey);
  if (result.success) {
    isLicenseValid = true;
  }
  return result;
});

/**
 * IPC: Deactivates the current licence and resets the licence state.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('deactivate-license', async () => {
  if (process.env?.DEBUG) console.log('[IPC] deactivate-license called');
  const result = await LicenseManager.deactivateLicense();
  if (result.success) {
    isLicenseValid = false;
  }
  return result;
});

/**
 * IPC: Returns raw licence info without refreshing.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
ipcMain.handle('get-license-info', async () => {
  if (process.env?.DEBUG) console.log('[IPC] get-license-info called');
  return LicenseManager.getLicenseInfo();
});

/**
 * IPC: Signals the renderer that licence activation is confirmed.
 * Starts app services if not already running and navigates to the main page.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('license-activated', async () => {
  if (process.env?.DEBUG) console.log('[IPC] license-activated called - starting services');
  if (mainWindow?.isDestroyed?.()) return { success: false, error: 'Window not ready' };
  // Start app services if not already started
  if (!deviceMonitor) {
    await startAppServices();
  }
  // Navigate to mode selection
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return { success: true };
});

/**
 * @param {number} currentCount - Current number of registered devices
 * @returns {Promise<{allowed:boolean,canAdd:boolean,limit:number,remaining:number}>}
 */
ipcMain.handle('can-add-phone', async (event, currentCount) => {
  return LicenseManager.canAddPhone(currentCount);
});

/**
 * @returns {Promise<boolean>} Whether remote access is allowed by the licence
 */
ipcMain.handle('is-remote-access-allowed', async () => {
  return LicenseManager.isRemoteAccessAllowed();
});

// =====================================================
// IPC: MODE SELECTION
// =====================================================

/**
 * @param {string} mode - 'home' or 'office'
 * @returns {Promise<{success:boolean,mode:string}>}
 */
ipcMain.handle('select-mode', async (event, mode) => {
  if (process.env?.DEBUG) console.log('[IPC] Mode selected:', mode);
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  currentMode = mode;
  appStore.set('lastMode', mode);

  const htmlFile = mode === 'home' ? 'home.html' : 'office.html';
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', htmlFile));

  return { success: true, mode };
});

/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('go-back', async () => {
  if (process.env?.DEBUG) console.log('[IPC] Going back to mode selection');
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  currentMode = null;
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return { success: true };
});

/**
 * IPC: Returns the currently selected mode ('home', 'office', or null).
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<string|null>}
 */
ipcMain.handle('get-current-mode', async () => {
  return currentMode;
});

// =====================================================
// IPC: SETUP
// =====================================================

/**
 * @returns {Promise<boolean>} Whether the initial setup wizard has been completed
 */
/**
 * IPC: Returns whether the setup wizard has been completed.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<boolean>}
 */
ipcMain.handle('is-setup-completed', async () => {
  return appStore.get('setupCompleted', false);
});

/**
 * Flags the setup wizard as complete.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('complete-setup', async () => {
  appStore.set('setupCompleted', true);
  return { success: true };
});

/**
 * Navigates the main window to the appropriate active page for the current mode.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('navigate-to-main', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  const htmlFile = currentMode === 'office' ? 'office.html' : (currentMode === 'home' ? 'home.html' : 'index.html');
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', htmlFile));
  return { success: true };
});

/**
 * Navigates to the setup wizard page.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('navigate-to-setup', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
  return { success: true };
});

/**
 * Navigates to the help page.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('navigate-to-help', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'help.html'));
  return { success: true };
});

// =====================================================
// IPC: TAILSCALE
// =====================================================

/**
 * @returns {Promise<{installed:boolean,running:boolean,version?:string,error?:string}>}
 *  Tailscale daemon / connection status snapshot
 */
/**
 * IPC: Returns the current status of the Tailscale daemon.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{installed:boolean,running:boolean,connected:boolean,ip?:string,error?:string}>}
 */
ipcMain.handle('tailscale-status', async () => {
  return await tailscaleManager.getStatus();
});

/**
 * Installs Tailscale. Progress events are forwarded to the renderer via 'tailscale-install-progress'.
 * @param {import('electron').IpcMainEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Installs the Tailscale daemon if not already present.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('tailscale-install', async (event) => {
  return await tailscaleManager.install((progress) => {
    event.sender.send('tailscale-install-progress', progress);
  });
});

/**
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Triggers a Tailscale login flow (opens the login URL in a browser).
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('tailscale-login', async () => {
  return await tailscaleManager.login();
});

/**
 * Opens Tailscale admin web UI.
 * @returns {Promise<{success:boolean}>}
 */
/**
 * IPC: Opens the Tailscale admin panel in the system browser.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('tailscale-open-admin', async () => {
  return await tailscaleManager.openAdmin();
});

// =====================================================
// IPC: PARSEC
// =====================================================

/**
 * @returns {Promise<{installed:boolean,running:boolean}>}
 *  Parsec runtime status (BinaryStat-compatible)
 */
/**
 * IPC: Returns the current Parsec service status.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{installed:boolean,running:boolean,loggedIn:boolean,error?:string}>}
 */
ipcMain.handle('parsec-status', async () => {
  return await parsecManager.getStatus();
});

/**
 * Installs Parsec. Progress events are forwarded to the renderer via 'parsec-install-progress'.
 * @param {import('electron').IpcMainEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Installs the Parsec client if not already present.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('parsec-install', async (event) => {
  return await parsecManager.install((progress) => {
    event.sender.send('parsec-install-progress', progress);
  });
});

/**
 * Opens the Parsec application window.
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Opens the Parsec client / dashboard in the system browser.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('parsec-open', async () => {
  return await parsecManager.open();
});

/**
 * Starts the Parsec application.
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Starts the Parsec service if installed.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('parsec-start', async () => {
  return await parsecManager.start();
});

// =====================================================
// IPC: DEVICES
// =====================================================

/**
 * @returns {Promise<{success:boolean,devices:import('./devices').DeviceInfo[]}>}
 *  Current list of connected ADB devices
 */
/**
 * IPC: Returns the list of currently connected ADB devices from the monitor.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,devices:Array<object>}>}
 */
ipcMain.handle('get-devices', async () => {
  if (process.env?.DEBUG) console.log('[IPC] get-devices called');
  if (process.env?.DEBUG) console.log('[IPC] deviceMonitor exists:', !!deviceMonitor);
  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  if (process.env?.DEBUG) console.log('[IPC] get-devices returning:', devices.length, 'devices');
  return { success: true, devices };
});

/**
 * Re-queries ADB for a fresh device list.
 * @returns {Promise<{success:boolean,devices:object[],error?:string}>}
 */
/**
 * IPC: Forces a device-rescan through the DeviceMonitor.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,devices:Array<object>,error?:string}>}
 */
ipcMain.handle('refresh-devices', async () => {
  if (process.env?.DEBUG) console.log('[IPC] refresh-devices called');
  if (process.env?.DEBUG) console.log('[IPC] deviceMonitor exists:', !!deviceMonitor);
  if (deviceMonitor) {
    const devices = await deviceMonitor.refresh();
    if (process.env?.DEBUG) console.log('[IPC] refresh-devices returning:', devices.length, 'devices');
    return { success: true, devices };
  }
  if (process.env?.DEBUG) console.log('[IPC] refresh-devices: Monitor not initialized!');
  return { success: false, error: 'Monitor not initialized', devices: [] };
});

/**
 * @returns {Promise<{running:boolean,version?:string,error?:string}>}
 */
/**
 * IPC: Returns the ADB daemon connection status.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{connected:boolean,version?:string,error?:string}>}
 */
ipcMain.handle('adb-status', async () => {
  if (process.env?.DEBUG) console.log('[IPC] adb-status called');
  const status = await adbManager.getStatus();
  if (process.env?.DEBUG) console.log('[IPC] adb-status returning:', status);
  return status;
});

// =====================================================
// IPC: SCRCPY
// =====================================================

/**
 * IPC: Returns the scrcpy session/running status.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
ipcMain.handle('scrcpy-status', async () => {
  return await scrcpyManager.getStatus();
});

/**
 * Starts a scrcpy mirror for every connected ADB device.
 * @returns {Promise<{success:boolean,results:import('./scrcpy').DeviceStartResult[],devices:string[]}>}
 */
/**
 * IPC: Starts a scrcpy window for every currently connected device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,results:Array<{deviceId:string,success:boolean,error?:string}>}>}
 */
ipcMain.handle('scrcpy-start-all', async () => {
  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  const deviceIds = devices.map(d => d.id);

  if (deviceIds.length === 0) {
    return { success: false, error: 'No devices connected' };
  }

  const result = await scrcpyManager.startAll(deviceIds);

  // Send window started events
  for (const r of result.results) {
    if (r.success) {
      try { mainWindow?.webContents?.send('scrcpy-window-started', { deviceId: r.deviceId }); } catch(e) { /* window gone */ }
    }
  }

  return result;
});

/**
 * Stops all running scrcpy mirror windows.
 * @returns {Promise<{success:boolean}>}
 */
/**
 * IPC: Stops all active scrcpy sessions.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('scrcpy-stop-all', async () => {
  return await scrcpyManager.stopAll();
});

/**
 * Starts scrcpy mirror for a single device.
 * @param {string} deviceId - ADB device identifier
 * @returns {Promise<{success:boolean,deviceId:string,error?:string}>}
 */
/**
 * IPC: Starts a scrcpy window for a single device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @returns {Promise<{success:boolean,deviceId:string,error?:string}>}
 */
ipcMain.handle('scrcpy-start-device', async (event, deviceId) => {
  if (process.env?.DEBUG) console.log('[IPC] scrcpy-start-device called for:', deviceId);
  const safeDeviceId = ipcDeviceId(deviceId);
  const result = await scrcpyManager.startDevice(safeDeviceId);

  if (result.success) {
    try { mainWindow?.webContents?.send('scrcpy-window-started', { deviceId: safeDeviceId }); } catch(e) { /* window gone */ }
  }

  return result;
});

/**
 * Stops a running scrcpy mirror for a single device.
 * @param {string} deviceId - ADB device identifier
 * @returns {Promise<{success:boolean,deviceId:string}>}
 */
/**
 * IPC: Stops an active scrcpy session for a single device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('scrcpy-stop-device', async (event, deviceId) => {
  const safeDeviceId = ipcDeviceId(deviceId);
  return await scrcpyManager.stopDevice(safeDeviceId);
});

/**
 * @returns {Promise<{width?:number,height?:number,bitrate?:number,fullscreen?:boolean,alwaysOnTop?:boolean}>}
 *  Current scrcpy mirror options
 */
/**
 * IPC: Returns the current scrcpy configuration options.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
ipcMain.handle('scrcpy-get-options', async () => {
  return scrcpyManager.getOptions();
});

/**
 * @param {object} options - Partial scrcpy options to save
 * @returns {Promise<{success:boolean}>}
 */
/**
 * IPC: Saves updated scrcpy configuration options.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {object} options - Partial options object to merge into stored config
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('scrcpy-set-options', async (event, options) => {
  return scrcpyManager.setOptions(options);
});

// =====================================================
// IPC: ADB TEXT INPUT
// =====================================================

/**
 * Sends a text string to an ADB device via `adb shell input text`.
 * @param {string} deviceId - ADB device identifier
 * @param {string} text - Text to type on the device
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Sends text input to a connected device via ADB.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @param {string} text - The text to type on the device
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('send-text-to-device', async (event, deviceId, text) => {
  if (process.env?.DEBUG) console.log('[IPC] send-text-to-device called for:', deviceId, 'text:', text);
  const safeDeviceId = ipcDeviceId(deviceId);
  const textCheck = ipcDeviceText(text);
  if (!textCheck.success) {
    return { success: false, error: textCheck.error };
  }
  return await adbManager.sendText(safeDeviceId, textCheck.text);
});

/**
 * Sends a key event to an ADB device via `adb shell input keyevent`.
 * @param {string} deviceId - ADB device identifier
 * @param {number} keycode - Android keycode integer (e.g. 3 = HOME)
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * IPC: Sends a hardware key event to a connected device via ADB.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @param {string|number} keycode - The Android keycode to send (e.g. KEYCODE_HOME = 3)
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('send-key-to-device', async (event, deviceId, keycode) => {
  if (process.env?.DEBUG) console.log('[IPC] send-key-to-device called for:', deviceId, 'keycode:', keycode);
  const safeDeviceId = ipcDeviceId(deviceId);
  return await adbManager.sendKey(safeDeviceId, keycode);
});

// =====================================================
// IPC: AUTOSTART
// =====================================================

/**
 * @returns {Promise<{enabled:boolean}>}
 */
ipcMain.handle('autostart-status', async () => {
  return autostartManager.getStatus();
});

/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('autostart-enable', async () => {
  return { success: autostartManager.enable() };
});

/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('autostart-disable', async () => {
  return { success: autostartManager.disable() };
});

/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('autostart-toggle', async () => {
  return { success: autostartManager.toggle() };
});

/**
 * @returns {Promise<object>} All autostart configuration flags
 */
ipcMain.handle('get-autostart-settings', async () => {
  return autostartManager.getAllSettings();
});

/**
 * @param {object} settings - Partial autostart settings merge object
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('update-autostart-settings', async (event, settings) => {
  return autostartManager.updateSettings(settings);
});

// =====================================================
// IPC: FULL STATUS
// =====================================================

/**
 * IPC: Returns a comprehensive status snapshot of all subsystems in one call.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,tailscale:object,parsec:object,scrcpy:object,autostart:object,homeComputerName:string}>}
 */
/**
 * Gathers a snapshot of all top-level subsystem statuses in one call.
 * @returns {Promise<{success:boolean,tailscale:object,parsec:object,scrcpy:object,autostart:object,homeComputerName:string}>}
 */
ipcMain.handle('get-full-status', async () => {
  if (process.env?.DEBUG) console.log('[IPC] get-full-status called');

  const [tailscale, parsec, scrcpy, autostart] = await Promise.all([
    tailscaleManager.getStatus(),
    parsecManager.getStatus(),
    scrcpyManager.getStatus(),
    Promise.resolve(autostartManager.getStatus())
  ]);

  if (process.env?.DEBUG) console.log('[IPC] Tailscale status:', tailscale);
  if (process.env?.DEBUG) console.log('[IPC] Parsec status:', parsec);

  return {
    success: true,
    tailscale,
    parsec,
    scrcpy,
    autostart,
    homeComputerName: appStore.get('homeComputerName', '')
  };
});

// =====================================================
// IPC: DEVICE CUSTOMIZATION
// =====================================================

/**
 * IPC: Retrieves persisted data for a specific device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @returns {Promise<object>}
 */
/**
 * @param {string} deviceId - ADB device identifier
 * @returns {Promise<import('./device-store').DeviceData>}
 */
ipcMain.handle('get-device-data', async (event, deviceId) => {
  const safeDeviceId = ipcDeviceId(deviceId);
  return deviceStore.getDeviceData(safeDeviceId);
});

/**
 * IPC: Persists customisation data for a specific device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @param {object} data - Arbitrary JSON-safe data to store
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {string} deviceId - ADB device identifier
 * @param {object} data - Partial device data to persist
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('save-device-data', async (event, deviceId, data) => {
  const safeDeviceId = ipcDeviceId(deviceId);
  return deviceStore.saveDeviceData(safeDeviceId, data);
});

/**
 * IPC: Deletes all stored customisation data for a device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {string} deviceId - ADB device identifier
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('delete-device-data', async (event, deviceId) => {
  const safeDeviceId = ipcDeviceId(deviceId);
  deviceStore.deleteDeviceData(safeDeviceId);
  return { success: true };
});

/**
 * IPC: Returns all stored device data keyed by device ID.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
/**
 * @returns {Promise<{success:boolean,devices:ImportDeviceDataItem[]}>}
 *  All device records including non-connected devices
 */
ipcMain.handle('get-all-device-data', async () => {
  return deviceStore.getAllDeviceData();
});

/**
 * IPC: Persists device grid positions / ordering to disk.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Array<{id:string, col:number, row:number, group?:string}>} positions
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {object[]} positions - Array of {id, x, y, groupName} position entries
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('update-device-positions', async (event, positions) => {
  deviceStore.updateDevicePositions(positions);
  return { success: true };
});

/**
 * IPC: Returns the list of all defined device groups.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<string>>}
 */
/**
 * @returns {Promise<string[]>} All defined device group names
 */
ipcMain.handle('get-groups', async () => {
  return deviceStore.getGroups();
});

/**
 * IPC: Creates a new device group.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} name - The group name
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * @param {string} name - Group name to create
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('add-group', async (event, name) => {
  return deviceStore.addGroup(name);
});

/**
 * IPC: Removes a device group by name.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} name - The group name
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * @param {string} name - Group name to remove
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('remove-group', async (event, name) => {
  return deviceStore.removeGroup(name);
});

/**
 * IPC: Renames an existing device group.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} oldName - The current group name
 * @param {string} newName - The new group name
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * @param {string} oldName - Current group name
 * @param {string} newName - New group name
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('rename-group', async (event, oldName, newName) => {
  return deviceStore.renameGroup(oldName, newName);
});

/**
 * IPC: Returns devices merged with their stored customisation data.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<object>>}
 */
/**
 * @returns {Promise<any[]>}
 *  Merged device list (connected + stored records with names/groups/positions)
 */
ipcMain.handle('get-merged-devices', async () => {
  if (process.env?.DEBUG) console.log('[IPC] get-merged-devices called');
  if (process.env?.DEBUG) console.log('[IPC] deviceMonitor exists:', !!deviceMonitor);
  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  if (process.env?.DEBUG) console.log('[IPC] Raw devices from monitor:', devices.length);
  const merged = deviceStore.mergeDeviceData(devices);
  if (process.env?.DEBUG) console.log('[IPC] Merged devices:', merged.length);
  return merged;
});

/**
 * IPC: Returns all device-store settings.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
/**
 * @returns {Promise<object>} Current device-store settings (grid cols/rows, etc.)
 */
ipcMain.handle('get-device-store-settings', async () => {
  return deviceStore.getSettings();
});

/**
 * IPC: Sets a single device-store setting by key.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} key - The setting key
 * @param {*} value - The setting value
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {string} key   - Setting key
 * @param {any}    value - Setting value
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-device-store-setting', async (event, key, value) => {
  return deviceStore.setSetting(key, value);
});

/**
 * IPC: Serialises and returns all device-store data as JSON for download / export.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,data?:string,error?:string}>}
 */
/**
 * @returns {Promise<{success:boolean,data:object}>}
 */
ipcMain.handle('export-device-data', async () => {
  return deviceStore.exportData();
});

/**
 * IPC: Imports serialised device-store data (e.g. from a previous export).
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} data - JSON string previously returned by export-device-data
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * @param {object} data - Previously exported device data JSON
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('import-device-data', async (event, data) => {
  return deviceStore.importData(data);
});

// =====================================================
// IPC: NOTIFICATIONS
// =====================================================

/**
 * IPC: Returns the current notification settings.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
/**
 * @returns {Promise<{enabled:boolean,soundEnabled:boolean}>}
 */
ipcMain.handle('get-notification-settings', async () => {
  return notificationManager.getSettings();
});

/**
 * IPC: Enables or disables system notifications.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {boolean} enabled - Whether notifications should be active
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {boolean} enabled - Enable/disable notifications
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-notification-enabled', async (event, enabled) => {
  notificationManager.setEnabled(enabled);
  return { success: true };
});

/**
 * IPC: Enables or disables notification sound.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {boolean} enabled - Whether sound should be active
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {boolean} enabled - Enable/disable notification sound
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-notification-sound', async (event, enabled) => {
  notificationManager.setSoundEnabled(enabled);
  return { success: true };
});

/**
 * IPC: Replaces the full notification configuration object.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {object} settings - Partial notification settings to merge
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {object} settings - Partial notification settings merge object
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('update-notification-settings', async (event, settings) => {
  notificationManager.updateSettings(settings);
  return { success: true };
});

// =====================================================
// IPC: SHORTCUTS
// =====================================================

/**
 * IPC: Returns the list of registered keyboard shortcuts.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<object>>}
 */
/**
 * @returns {Promise<object[]>} List of registered keyboard shortcuts
 */
ipcMain.handle('get-shortcuts', async () => {
  return shortcutManager.getShortcutList();
});

// =====================================================
// IPC: FARM STATE
// =====================================================

/**
 * IPC: Sets the global farm-running state flag.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {boolean} running - Whether the farm is actively running
 * @returns {Promise<{success:boolean}>}
 */
/**
 * Sets the global farm-running state flag.
 * @param {boolean} running - Whether the farm loop is active
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-farm-running', async (event, running) => {
  isFarmRunning = running;
  return { success: true };
});

/**
 * IPC: Returns the current farm-running state flag.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<boolean>}
 */
/**
 * @returns {Promise<boolean>} Whether the farm loop is currently running
 */
ipcMain.handle('get-farm-running', async () => {
  return isFarmRunning;
});

// =====================================================
// IPC: HOME COMPUTER (Office mode)
// =====================================================

/**
 * IPC: Returns the configured home-computer hostname used in Office mode.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<string>}
 */
/**
 * @returns {Promise<string>} Stored home computer name (empty string if unset)
 */
ipcMain.handle('get-home-computer-name', async () => {
  return appStore.get('homeComputerName', '');
});

/**
 * IPC: Persists the home-computer hostname for Office mode.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} name - The hostname or IP to store
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @param {string} name - Home computer display name
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-home-computer-name', async (event, name) => {
  appStore.set('homeComputerName', name);
  return { success: true };
});

// =====================================================
// IPC: ABOUT
// =====================================================

/**
 * IPC: Opens the "About" dialog window.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
/**
 * Opens the "About" modal window.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('open-about', async () => {
  createAboutWindow();
  return { success: true };
});

/**
 * IPC: Closes the "About" dialog window.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
/**
 * Closes the "About" modal window if it is open.
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('close-about', async () => {
  if (aboutWindow) {
    aboutWindow.close();
  }
  return { success: true };
});

/**
 * IPC: Returns build/version information for the application.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{name:string,version:string,author:string,electron:string,node:string,chrome:string}>}
 */
/**
 * @returns {Promise<{name:string,version:string,author:string,electron:string,node:string,chrome:string}>}
 */
ipcMain.handle('get-app-info', async () => {
  return {
    name: 'Phone Farm',
    version: APP_VERSION,
    author: 'SERGIO',
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  };
});

// =====================================================
// IPC: UTILITY
// =====================================================

/**
 * IPC: Opens an external URL in the system's default browser.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} url - The URL to open
 * @returns {Promise<{success:boolean,error?:string}>}
 */
/**
 * Opens a URL in the user's default browser.
 * @param {string} url - URL to open
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/**
 * IPC: Minimises the main application window.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('minimize-window', async () => {
  mainWindow?.minimize();
  return { success: true };
});

/**
 * IPC: Terminates the entire application process.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
/**
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('quit-app', async () => {
  app.quit();
  return { success: true };
});

// =====================================================
// ERROR HANDLING
// =====================================================

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
  app.quit();
  setTimeout(() => process.exit(1), 2000);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
  app.quit();
  setTimeout(() => process.exit(1), 2000);
});

process.on('SIGTERM', () => {
  app.quit();
});

if (process.env?.DEBUG) console.log('[Main] Phone Farm main process loaded');
