// =====================================================
// PHONE FARM V2 - UNIFIED APPLICATION
// Main Process Entry Point
// by SERGIO
// =====================================================

const { app, BrowserWindow, ipcMain, shell, Menu, session } = require('electron');
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
let LicenseManager;
try {
  LicenseManager = require('./license');
  if (!LicenseManager || typeof LicenseManager.checkLicense !== 'function') {
    console.warn('[Main] License module loaded but checkLicense not available, using fallback');
    LicenseManager = {
      checkLicense: async () => ({ isValid: false, error: 'License module incomplete' }),
      cleanup: async () => {},
      getLicenseInfo: () => ({ isValid: false, maxPhones: 5, remoteAccess: false }),
      activateLicense: async () => ({ success: false, error: 'Not available' }),
      deactivateLicense: async () => ({ success: false, error: 'Not available' }),
      canAddPhone: () => ({ allowed: false, reason: 'License module unavailable' }),
      isRemoteAccessAllowed: () => ({ allowed: false, reason: 'License module unavailable' })
    };
  }
} catch (e) {
  console.error('[Main] Failed to load license module:', e.message);
  LicenseManager = {
    checkLicense: async () => ({ isValid: false, error: e.message }),
    cleanup: async () => {},
    getLicenseInfo: () => ({ isValid: false, maxPhones: 5, remoteAccess: false }),
    activateLicense: async () => ({ success: false, error: e.message }),
    deactivateLicense: async () => ({ success: false, error: e.message }),
    canAddPhone: () => ({ allowed: false, reason: e.message }),
    isRemoteAccessAllowed: () => ({ allowed: false, reason: e.message })
  };
}
const Paths = require('./paths');
const { ipcDeviceId, ipcDeviceText } = require('./ipc-validators');
const HealthMonitor = require('./health-monitor');
const Updater = require('./updater');

// Version from package.json
const appPkg = require(path.join(__dirname, '..', '..', 'package.json'));
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
const licenseManager = require('./license');
let deviceMonitor = null;
let healthMonitor = null;

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

   // Check if setup is completed first
   const setupCompleted = appStore.get('setupCompleted', false);
   if (!setupCompleted) {
     mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup.html'));
   } else if (isLicenseValid) {
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
    title: 'About - Phone Farm',
    parent: mainWindow,
    modal: true
  });

  aboutWindow.loadFile(path.join(__dirname, '..', 'renderer', 'about.html'));

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

// =====================================================
// APPLICATION MENU
// =====================================================

function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => Updater.checkForUpdates(),
          accelerator: 'CmdOrCtrl+Shift+U'
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// =====================================================
// APP LIFECYCLE
// =====================================================

// ── Input validation helpers ─────────────────────────────────────────────────
const VALID_DEVICE_ID_RE = /^[a-zA-Z0-9_\-]+$/;
const VALID_PHONE_RE = /^\+?[0-9]{10,15}$/;
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const VALID_MODES = ['home', 'office'];

function assertValidDeviceId(value, label) {
  if (typeof value !== 'string' || !VALID_DEVICE_ID_RE.test(value)) {
    throw new Error(`Invalid ${label || 'device ID'}: must match ^[a-zA-Z0-9_-]+$`);
  }
}

function assertValidPhoneNumber(value) {
  if (typeof value !== 'string' || !VALID_PHONE_RE.test(value)) {
    throw new Error('Invalid phone number: must match ^+?[0-9]{10,15}$');
  }
}

function sanitizeFilePath(filePath) {
  if (typeof filePath !== 'string') throw new Error('File path must be a string');
  const resolved = path.resolve(filePath);
  const projectRoot = path.resolve(__dirname, '..', '..');
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    throw new Error('File path must be within the project directory');
  }
  return resolved;
}

function assertJsonBodySize(data) {
  if (data !== undefined && data !== null) {
    const size = typeof data === 'string' ? data.length : JSON.stringify(data).length;
    if (size > MAX_REQUEST_BODY_BYTES) {
      throw new Error('Request body exceeds maximum allowed size');
    }
  }
}

app.whenReady().then(async () => {
  if (process.env?.DEBUG) console.debug('[App] Starting Phone Farm...');
  if (process.env?.DEBUG) console.debug('[App] App packaged:', app.isPackaged);

  // ── Content Security Policy ───────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:*"
        ]
      }
    });
  });

  // Log all paths for debugging
  Paths.logPaths();

  // Check license first
  if (process.env?.DEBUG) console.debug('[App] Checking license...');
  try {
    const licenseResult = await LicenseManager.checkLicense();
    isLicenseValid = licenseResult.isValid;
    if (process.env?.DEBUG) console.debug('[App] License valid:', isLicenseValid);
  } catch (e) {
    console.error('[App] License check error:', e.message);
    isLicenseValid = false;
  }

  // Create window
  createWindow();

  // Initialize auto-updater (checks for updates if autoCheck is enabled)
  Updater.init();

  // Build application menu with "Check for Updates" item
  buildAppMenu();

  // Initialize health monitor
  healthMonitor = new HealthMonitor({
    adbManager,
    licenseManager,
    deviceStore,
    paths: Paths
  });
  healthMonitor.init();

  // Wire critical health alerts to renderer
  healthMonitor.onCritical((alerts) => {
    try { mainWindow?.webContents?.send('health:system-critical', alerts); } catch (e) { console.debug('IPC handler error:', e.message); }
  });

  // If license is valid, start normal services
  if (isLicenseValid) {
    await startAppServices();
  }

  // Register shortcuts
  shortcutManager.registerAll();
});

// Start app services (ADB, device monitoring)
async function startAppServices() {
  if (process.env?.DEBUG) console.debug('[App] ========== START APP SERVICES ==========');

  // Start ADB server
  try {
    if (process.env?.DEBUG) console.debug('[App] Starting ADB server...');
    const adbResult = await adbManager.startServer();
    if (process.env?.DEBUG) console.debug('[App] ADB server start result:', adbResult);
  } catch (e) {
    console.error('[App] ADB start error:', e.message);
  }

  // Initialize device monitor
  if (process.env?.DEBUG) console.debug('[App] Creating DeviceMonitor...');
  deviceMonitor = new DeviceMonitor(adbManager, autostartManager, scrcpyManager);
  if (process.env?.DEBUG) console.debug('[App] DeviceMonitor created');

  // Device events
  deviceMonitor.on('devices-changed', (devices) => {
    if (process.env?.DEBUG) console.debug('[App] devices-changed event, count:', devices.length);
    try { mainWindow?.webContents?.send('devices-updated', devices); } catch(e) { console.debug('IPC handler error:', e.message); }
  });

  deviceMonitor.on('device-connected', (device) => {
    if (process.env?.DEBUG) console.debug('[App] device-connected event:', device.id);
    notificationManager.deviceConnected(device);
    try { mainWindow?.webContents?.send('device-connected', device); } catch(e) { console.debug('IPC handler error:', e.message); }
  });

  deviceMonitor.on('device-disconnected', (device) => {
    if (process.env?.DEBUG) console.debug('[App] device-disconnected event:', device.id);
    notificationManager.deviceDisconnected(device);
    try { mainWindow?.webContents?.send('device-disconnected', device); } catch(e) { console.debug('IPC handler error:', e.message); }
  });

  // Start device monitoring
  if (process.env?.DEBUG) console.debug('[App] Starting DeviceMonitor...');
  deviceMonitor.start();
  if (process.env?.DEBUG) console.debug('[App] ========== APP SERVICES STARTED ==========');
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
  if (process.env?.DEBUG) console.debug('[IPC] check-license called');
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
  if (process.env?.DEBUG) console.debug('[IPC] activate-license called');
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
  if (process.env?.DEBUG) console.debug('[IPC] deactivate-license called');
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
  if (process.env?.DEBUG) console.debug('[IPC] get-license-info called');
  return LicenseManager.getLicenseInfo();
});

/**
 * IPC: Signals the renderer that licence activation is confirmed.
 * Starts app services if not already running and navigates to the main page.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('license-activated', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] license-activated called - starting services');
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
  if (process.env?.DEBUG) console.debug('[IPC] Mode selected:', mode);
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Window not ready' };
  if (!VALID_MODES.includes(mode)) return { success: false, error: 'Invalid mode' };
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
  if (process.env?.DEBUG) console.debug('[IPC] Going back to mode selection');
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
 * IPC: Returns the current status of the Tailscale daemon.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{installed:boolean,running:boolean,connected:boolean,ip?:string,error?:string}>}
 */
ipcMain.handle('tailscale-status', async () => {
  return await tailscaleManager.getStatus();
});

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
 * IPC: Triggers a Tailscale login flow (opens the login URL in a browser).
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('tailscale-login', async () => {
  return await tailscaleManager.login();
});

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
 * IPC: Returns the current Parsec service status.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{installed:boolean,running:boolean,loggedIn:boolean,error?:string}>}
 */
ipcMain.handle('parsec-status', async () => {
  return await parsecManager.getStatus();
});

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
 * IPC: Opens the Parsec client / dashboard in the system browser.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('parsec-open', async () => {
  return await parsecManager.open();
});

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
 * IPC: Returns the list of currently connected ADB devices from the monitor.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,devices:Array<object>}>}
 */
ipcMain.handle('get-devices', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] get-devices called');
  if (process.env?.DEBUG) console.debug('[IPC] deviceMonitor exists:', !!deviceMonitor);
  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  if (process.env?.DEBUG) console.debug('[IPC] get-devices returning:', devices.length, 'devices');
  return { success: true, devices };
});

/**
 * IPC: Forces a device-rescan through the DeviceMonitor.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,devices:Array<object>,error?:string}>}
 */
ipcMain.handle('refresh-devices', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] refresh-devices called');
  if (process.env?.DEBUG) console.debug('[IPC] deviceMonitor exists:', !!deviceMonitor);
  if (deviceMonitor) {
    const devices = await deviceMonitor.refresh();
    if (process.env?.DEBUG) console.debug('[IPC] refresh-devices returning:', devices.length, 'devices');
    return { success: true, devices };
  }
  if (process.env?.DEBUG) console.debug('[IPC] refresh-devices: Monitor not initialized!');
  return { success: false, error: 'Monitor not initialized', devices: [] };
});

/**
 * IPC: Returns the ADB daemon connection status.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{connected:boolean,version?:string,error?:string}>}
 */
ipcMain.handle('adb-status', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] adb-status called');
  const status = await adbManager.getStatus();
  if (process.env?.DEBUG) console.debug('[IPC] adb-status returning:', status);
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
      try { mainWindow?.webContents?.send('scrcpy-window-started', { deviceId: r.deviceId }); } catch(e) { console.debug('IPC handler error:', e.message); }
    }
  }

  return result;
});

/**
 * IPC: Stops all active scrcpy sessions.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('scrcpy-stop-all', async () => {
  return await scrcpyManager.stopAll();
});

/**
 * IPC: Starts a scrcpy window for a single device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @returns {Promise<{success:boolean,deviceId:string,error?:string}>}
 */
ipcMain.handle('scrcpy-start-device', async (event, deviceId) => {
  if (process.env?.DEBUG) console.debug('[IPC] scrcpy-start-device called for:', deviceId);
  const safeDeviceId = ipcDeviceId(deviceId);
  const result = await scrcpyManager.startDevice(safeDeviceId);

  if (result.success) {
    try { mainWindow?.webContents?.send('scrcpy-window-started', { deviceId: safeDeviceId }); } catch(e) { console.debug('IPC handler error:', e.message); }
  }

  return result;
});

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
 * IPC: Returns the current scrcpy configuration options.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
 */
ipcMain.handle('scrcpy-get-options', async () => {
  return scrcpyManager.getOptions();
});

/**
 * IPC: Saves updated scrcpy configuration options.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {object} options - Partial options object to merge into stored config
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('scrcpy-set-options', async (event, options) => {
  assertJsonBodySize(options);
  return scrcpyManager.setOptions(options);
});

// =====================================================
// IPC: ADB TEXT INPUT
// =====================================================

/**
 * IPC: Sends text input to a connected device via ADB.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @param {string} text - The text to type on the device
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('send-text-to-device', async (event, deviceId, text) => {
  if (process.env?.DEBUG) console.debug('[IPC] send-text-to-device called for:', deviceId, 'text:', text);
  const safeDeviceId = ipcDeviceId(deviceId);
  const textCheck = ipcDeviceText(text);
  if (!textCheck.success) {
    return { success: false, error: textCheck.error };
  }
  return await adbManager.sendText(safeDeviceId, textCheck.text);
});

/**
 * IPC: Sends a hardware key event to a connected device via ADB.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - The device identifier
 * @param {string|number} keycode - The Android keycode to send (e.g. KEYCODE_HOME = 3)
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('send-key-to-device', async (event, deviceId, keycode) => {
  if (process.env?.DEBUG) console.debug('[IPC] send-key-to-device called for:', deviceId, 'keycode:', keycode);
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
  assertJsonBodySize(settings);
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
ipcMain.handle('get-full-status', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] get-full-status called');

  const [tailscale, parsec, scrcpy, autostart] = await Promise.all([
    tailscaleManager.getStatus(),
    parsecManager.getStatus(),
    scrcpyManager.getStatus(),
    Promise.resolve(autostartManager.getStatus())
  ]);

  if (process.env?.DEBUG) console.debug('[IPC] Tailscale status:', tailscale);
  if (process.env?.DEBUG) console.debug('[IPC] Parsec status:', parsec);

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
ipcMain.handle('get-all-device-data', async () => {
  return deviceStore.getAllDeviceData();
});

/**
 * IPC: Persists device grid positions / ordering to disk.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Array<{id:string, col:number, row:number, group?:string}>} positions
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('update-device-positions', async (event, positions) => {
  if (!Array.isArray(positions) || positions.length > 500) {
    return { success: false, error: 'Invalid positions data' };
  }
  deviceStore.updateDevicePositions(positions);
  return { success: true };
});

/**
 * IPC: Returns the list of all defined device groups.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<string>>}
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
ipcMain.handle('add-group', async (event, name) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    return { success: false, error: 'Invalid group name' };
  }
  return deviceStore.addGroup(name);
});

/**
 * IPC: Removes a device group by name.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} name - The group name
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('remove-group', async (event, name) => {
  if (typeof name !== 'string' || !name.trim()) {
    return { success: false, error: 'Invalid group name' };
  }
  return deviceStore.removeGroup(name);
});

/**
 * IPC: Renames an existing device group.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} oldName - The current group name
 * @param {string} newName - The new group name
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('rename-group', async (event, oldName, newName) => {
  if (typeof oldName !== 'string' || !oldName.trim() || typeof newName !== 'string' || !newName.trim()) {
    return { success: false, error: 'Invalid group name' };
  }
  return deviceStore.renameGroup(oldName, newName);
});

/**
 * IPC: Returns devices merged with their stored customisation data.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<object>>}
 */
ipcMain.handle('get-merged-devices', async () => {
  if (process.env?.DEBUG) console.debug('[IPC] get-merged-devices called');
  if (process.env?.DEBUG) console.debug('[IPC] deviceMonitor exists:', !!deviceMonitor);
  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  if (process.env?.DEBUG) console.debug('[IPC] Raw devices from monitor:', devices.length);
  const merged = deviceStore.mergeDeviceData(devices);
  if (process.env?.DEBUG) console.debug('[IPC] Merged devices:', merged.length);
  return merged;
});

/**
 * IPC: Returns all device-store settings.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<object>}
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
ipcMain.handle('set-device-store-setting', async (event, key, value) => {
  return deviceStore.setSetting(key, value);
});

/**
 * IPC: Serialises and returns all device-store data as JSON for download / export.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean,data?:string,error?:string}>}
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
ipcMain.handle('import-device-data', async (event, data) => {
  assertJsonBodySize(data);
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
ipcMain.handle('get-notification-settings', async () => {
  return notificationManager.getSettings();
});

/**
 * IPC: Enables or disables system notifications.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {boolean} enabled - Whether notifications should be active
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
ipcMain.handle('update-notification-settings', async (event, settings) => {
  assertJsonBodySize(settings);
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
ipcMain.handle('set-farm-running', async (event, running) => {
  isFarmRunning = running;
  return { success: true };
});

/**
 * IPC: Returns the current farm-running state flag.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<boolean>}
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
ipcMain.handle('get-home-computer-name', async () => {
  return appStore.get('homeComputerName', '');
});

/**
 * IPC: Persists the home-computer hostname for Office mode.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} name - The hostname or IP to store
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('set-home-computer-name', async (event, name) => {
  if (typeof name !== 'string' || name.length > 255) {
    return { success: false, error: 'Invalid computer name' };
  }
  appStore.set('homeComputerName', name);
  return { success: true };
});

// =====================================================
// IPC: ABOUT
// =====================================================

ipcMain.handle('open-about', async () => {
  createAboutWindow();
  return { success: true };
});

// =====================================================
// IPC: UPDATER
// =====================================================

ipcMain.handle('update:check', async () => {
  Updater.checkForUpdates();
  return { success: true };
});

ipcMain.handle('update:get-settings', async () => {
  return Updater.getSettings();
});

ipcMain.handle('update:save-settings', async (event, settings) => {
  Updater.saveSettings(settings);
  Updater.init();
  return { success: true };
});

/**
 * IPC: Closes the "About" dialog window.
 * @param {Electron.IpcMainInvokeEvent} event
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
// IPC: CALL HISTORY
// =====================================================

/**
 * IPC: Reads call log JSON files from the logs/ directory and returns parsed records.
 * Reads all *.json files in the logs/ directory, merges their contents, and
 * returns the combined list sorted by timestamp descending.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<{timestamp:string,number:string,duration:number,status:string}>>}
 */
ipcMain.handle('phone:call-bulk', async (event, numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return { success: false, error: 'No numbers provided for bulk call' };
  }

  const validNumbers = numbers.filter(num => {
    const clean = num.replace(/\s/g, '');
    const plus90Pattern = /^\+90[5]\d{8}$/;
    const zeroPattern = /^0[5]\d{9}$/;
    return plus90Pattern.test(clean) || zeroPattern.test(clean);
  });

  if (validNumbers.length === 0) {
    return { success: false, error: 'No valid phone numbers provided' };
  }

  const devices = deviceMonitor ? deviceMonitor.getDevices() : [];
  if (devices.length === 0) {
    return { success: false, error: 'No devices connected' };
  }

  const deviceId = devices[0].id;

  try {
    const jobId = await submitBulkCallJob(deviceId, validNumbers);
    return { success: true, jobId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function submitBulkCallJob(deviceId, numbers) {
  const steps = numbers.map(number => ({
    task: 'call',
    params: { number }
  }));

  const fs = require('fs');
  const path = require('path');
  
  const tempDir = require('os').tmpdir();
  const jobFilePath = path.join(tempDir, `bulk-call-${Date.now()}.json`);
  
  const jobData = {
    device_id: deviceId,
    steps: steps
  };
  
  fs.writeFileSync(jobFilePath, JSON.stringify(jobData, null, 2));
  
  try {
    const result = await adbManager.runCommand([
      'phone_farm_cli.py', 'submit', deviceId, jobFilePath
    ], { timeout: 30000 });
    
    const output = result.stdout || '';
    const jobIdMatch = output.match(/Job ID: (\S+)/);
    if (jobIdMatch) {
      return jobIdMatch[1];
    }
    
    return `bulk-call-${Date.now()}`;
  } finally {
    try { fs.unlinkSync(jobFilePath); } catch(e) { console.debug('Cleanup error:', e.message); }
  }
}

// =====================================================
// IPC: CALL HISTORY
// =====================================================

/**
 * IPC: Reads call log JSON files from the logs/ directory and returns parsed records.
 * Reads all *.json files in the logs/ directory, merges their contents, and
 * returns the combined list sorted by timestamp descending.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<Array<{timestamp:string,number:string,duration:number,status:string}>>}
 */
ipcMain.handle('call-history:get', async () => {
  const fs = require('fs');
  const logsDir = path.join(__dirname, '..', '..', 'logs');

  try {
    if (!fs.existsSync(logsDir)) {
      return [];
    }

    const files = fs.readdirSync(logsDir).filter(function (f) {
      return f.endsWith('.json');
    });

    if (files.length === 0) return [];

    let allRecords = [];

    for (const file of files) {
      try {
        const filePath = path.join(logsDir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);

        if (Array.isArray(data)) {
          allRecords = allRecords.concat(data);
        } else if (data && typeof data === 'object' && Array.isArray(data.records)) {
          allRecords = allRecords.concat(data.records);
        }
      } catch (e) {
        console.error('[IPC] call-history: error reading file', file, e.message);
      }
    }

    allRecords.sort(function (a, b) {
      if (!a.timestamp || !b.timestamp) return 0;
      return b.timestamp.localeCompare(a.timestamp);
    });

    return allRecords;
  } catch (e) {
    console.error('[IPC] call-history:get error:', e.message);
    return [];
  }
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
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'Only http/https URLs are allowed' };
    }
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
ipcMain.handle('minimize-window', async () => {
  mainWindow?.minimize();
  return { success: true };
});

/**
 * IPC: Terminates the entire application process.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {Promise<{success:boolean}>}
 */
ipcMain.handle('quit-app', async () => {
  app.quit();
  return { success: true };
});

// =====================================================
// IPC: DEVICE HEALTH
// =====================================================

/**
 * Collects battery, temperature, SIM, signal, and memory info via ADB shell.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string} deviceId - ADB device identifier
 * @returns {Promise<{ok:boolean,sim:object,signal:object,battery:object,memory:object,error?:string}>}
 */
ipcMain.handle('health:system', async () => {
  if (healthMonitor) {
    return { success: true, health: healthMonitor.getHealth() };
  }
  return { success: false, error: 'Health monitor not initialized' };
});

ipcMain.handle('health:get', async (event, deviceId) => {
  const safeDeviceId = ipcDeviceId(deviceId);
  if (!safeDeviceId) {
    return { ok: false, error: 'Invalid device ID' };
  }

  try {
    // Battery + temperature via dumpsys battery
    const batteryRaw = await adbManager.runCommand(
      ['-s', safeDeviceId, 'shell', 'dumpsys', 'battery'],
      { timeout: 10000 }
    );
    const battLines = batteryRaw.stdout || '';
    const levelMatch = battLines.match(/level:\s*(\d+)/);
    const tempMatch = battLines.match(/temperature:\s*(\d+)/);
    const battery = {
      level: levelMatch ? parseInt(levelMatch[1], 10) : null,
      temperature: tempMatch ? parseInt(tempMatch[1], 10) / 10 : null
    };

    // SIM state
    const simRaw = await adbManager.runCommand(
      ['-s', safeDeviceId, 'shell', 'getprop', 'gsm.sim.state'],
      { timeout: 10000 }
    );
    const sim = { sim_state: (simRaw.stdout || '').trim() || 'UNKNOWN' };

    // Signal strength
    const signalRaw = await adbManager.runCommand(
      ['-s', safeDeviceId, 'shell', 'dumpsys', 'telephony.registry'],
      { timeout: 10000 }
    );
    const signalMatch = (signalRaw.stdout || '').match(/mDbm=(-?\d+)/);
    const signal = { signal_dbm: signalMatch ? parseInt(signalMatch[1], 10) : null };

    // Memory via /proc/meminfo
    const memRaw = await adbManager.runCommand(
      ['-s', safeDeviceId, 'shell', 'cat', '/proc/meminfo'],
      { timeout: 10000 }
    );
    const memLines = memRaw.stdout || '';
    const totalMatch = memLines.match(/MemTotal:\s*(\d+)/);
    const availMatch = memLines.match(/MemAvailable:\s*(\d+)/);
    const totalKb = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    const availKb = availMatch ? parseInt(availMatch[1], 10) : 0;
    const memory = {
      total: totalKb,
      available: availKb,
      used: totalKb - availKb
    };

    return { ok: true, sim, signal, battery, memory };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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

// =====================================================
// IPC: PHONE CALLS
// =====================================================

/**
 * IPC: Initiates a phone call on a device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params - {deviceId: string, number: string}
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('phone:call', async (event, params) => {
   try {
   assertJsonBodySize(params);
   const { deviceId, number } = params;
   if (!deviceId || !number) {
      return { success: false, error: 'Device ID and number are required' };
   }
   assertValidDeviceId(deviceId, 'deviceId');
   assertValidPhoneNumber(number);
   try {
      // Execute phone_farm_cli.py call command
      const { exec } = require('child_process');
      const cliPath = require('path').join(__dirname, '..', '..', 'phone_farm_cli.py');
      return new Promise((resolve) => {
         exec(`python "${cliPath}" call "${deviceId}" --number "${number}"`, (error, stdout, stderr) => {
            if (error) {
               console.error('[IPC] phone:call error:', error);
               resolve({ success: false, error: error.message });
            } else {
               // Notify renderer of call state change
               mainWindow?.webContents?.send('phone-state-update', 'ringing');
               resolve({ success: true, output: stdout });
            }
         });
      });
   } catch (error) {
      console.error('[IPC] phone:call exception:', error);
      return { success: false, error: error.message };
   }
   } catch (outerError) {
      console.error('[IPC] phone:call outer exception:', outerError);
      return { success: false, error: outerError.message };
   }
});

/**
 * IPC: Answers an incoming call on a device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params - {deviceId: string}
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('phone:answer', async (event, params) => {
   try {
   assertJsonBodySize(params);
   const { deviceId } = params;
   if (!deviceId) {
      return { success: false, error: 'Device ID is required' };
   }
   assertValidDeviceId(deviceId, 'deviceId');
   try {
      // Execute phone_farm_cli.py answer command
      const { exec } = require('child_process');
      const cliPath = require('path').join(__dirname, '..', '..', 'phone_farm_cli.py');
      return new Promise((resolve) => {
         exec(`python "${cliPath}" run "${deviceId}" answer`, (error, stdout, stderr) => {
            if (error) {
               console.error('[IPC] phone:answer error:', error);
               resolve({ success: false, error: error.message });
            } else {
               // Notify renderer of call state change
               mainWindow?.webContents?.send('phone-state-update', 'active');
               resolve({ success: true, output: stdout });
            }
         });
      });
   } catch (error) {
      console.error('[IPC] phone:answer exception:', error);
      return { success: false, error: error.message };
   }
   } catch (outerError) {
      console.error('[IPC] phone:answer outer exception:', outerError);
      return { success: false, error: outerError.message };
   }
});

/**
 * IPC: Hangs up a call on a device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params - {deviceId: string}
 * @returns {Promise<{success:boolean,error?:string}>}
 */
ipcMain.handle('phone:hangup', async (event, params) => {
   try {
   assertJsonBodySize(params);
   const { deviceId } = params;
   if (!deviceId) {
      return { success: false, error: 'Device ID is required' };
   }
   assertValidDeviceId(deviceId, 'deviceId');
   try {
      // Execute phone_farm_cli.py hangup command
      const { exec } = require('child_process');
      const cliPath = require('path').join(__dirname, '..', '..', 'phone_farm_cli.py');
      return new Promise((resolve) => {
         exec(`python "${cliPath}" run "${deviceId}" hangup`, (error, stdout, stderr) => {
            if (error) {
               console.error('[IPC] phone:hangup error:', error);
               resolve({ success: false, error: error.message });
            } else {
               // Notify renderer of call state change
               mainWindow?.webContents?.send('phone-state-update', 'ended');
               resolve({ success: true, output: stdout });
            }
         });
      });
   } catch (error) {
      console.error('[IPC] phone:hangup exception:', error);
      return { success: false, error: error.message };
   }
   } catch (outerError) {
      console.error('[IPC] phone:hangup outer exception:', outerError);
      return { success: false, error: outerError.message };
   }
});

/**
 * IPC: Gets the current call state for a device.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params - {deviceId: string}
 * @returns {Promise<{success:boolean,state:string,error?:string}>}
 */
ipcMain.handle('phone:state', async (event, params) => {
   try {
   assertJsonBodySize(params);
   const { deviceId } = params;
   if (!deviceId) {
      return { success: false, error: 'Device ID is required' };
   }
   assertValidDeviceId(deviceId, 'deviceId');
   try {
      // For now, we'll return idle as default state
      // In a real implementation, this would query the device state
      return { success: true, state: 'idle' };
   } catch (error) {
      console.error('[IPC] phone:state exception:', error);
      return { success: false, error: error.message };
   }
   } catch (outerError) {
      console.error('[IPC] phone:state outer exception:', outerError);
      return { success: false, error: outerError.message };
   }
});

process.on('SIGTERM', () => {
   app.quit();
});

if (process.env?.DEBUG) console.debug('[Main] Phone Farm main process loaded');
