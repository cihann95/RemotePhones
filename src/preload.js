// =====================================================
// PHONE FARM V2 - PRELOAD SCRIPT
// Secure bridge between main and renderer processes
// =====================================================

const { contextBridge, ipcRenderer } = require('electron');
const APP_CONSTANTS = require('../main/constants');

// =====================================================
// RUNTIME SECURITY GUARD — Defense-in-depth
// =====================================================
// main.js sets `contextIsolation: true` in webPreferences so that the renderer
// process cannot access Node.js APIs directly. If that config is accidentally
// removed or overridden, the preload bridge below would expose powerful IPC
// channels to an un-isolated context, potentially allowing a compromised
// renderer (e.g. via XSS) to abuse them.
// This guard hard-fails early if the protections are not in place, regardless
// of what any source file claims.
//
// process.contextIsolation  — must be true so the preload runs in an isolated
//                              world apart from the renderer. When false, the
//                              renderer can reach preload variables directly
//                              and thus bypass every restriction here.
//
// process.type === 'browser' — ensures this preload is executing in a
//                              renderer context (browser window), not in a
//                              utility or child process where context islanding
//                              may not apply. Unexpected types indicate the
//                              preload has been loaded in the wrong process.
if (process.contextIsolated !== true) {
  console.warn('[Preload] contextIsolation is %s. "electronAPI" will not be exposed. Fix: set contextIsolation: true in main process.', process.contextIsolated ? 'OK' : 'DISABLED');
  console.error(
    '[Preload] SECURITY GUARD VIOLATION: process.contextIsolation is not true. ' +
    'contextIsolation must be enabled in BrowserWindow webPreferences to prevent ' +
    'renderer scripts from accessing the preload bridge context directly.'
  );
  contextBridge.exposeInMainWorld('electronAPI', {});
  return;
}

if (process.type !== 'browser') {
  console.error('Preload running outside browser process.');
  contextBridge.exposeInMainWorld('electronAPI', {});
  return;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // =====================================================
  // APP CONSTANTS
  // =====================================================
  constants: APP_CONSTANTS,

  // =====================================================
  // LICENSE
  // =====================================================
   /**
   * @typedef {Object} CheckLicenseResult
   * @property {boolean} isValid
   * @property {string} [type]
   * @property {string} [expiryDate]
   * @property {number} [gracePeriodDays]
   * @property {string} [error]
   */
  /** IPC: Checks whether a valid licence is installed */
  checkLicense: () => ipcRenderer.invoke('check-license'),
  /** IPC: Activates a licence key and persists the licence */
  activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
  /** IPC: Deactivates the current licence */
  deactivateLicense: () => ipcRenderer.invoke('deactivate-license'),
  /** IPC: Returns raw licence info object */
  getLicenseInfo: () => ipcRenderer.invoke('get-license-info'),
  /** IPC: Fires after licence activation; triggers app-service startup and route change */
  licenseActivated: () => ipcRenderer.invoke('license-activated'),
  /** IPC: Checks whether the current licence tier allows adding more devices */
  canAddPhone: (currentCount) => ipcRenderer.invoke('can-add-phone', currentCount),
  /** IPC: Checks whether the current licence includes remote-access rights */
  isRemoteAccessAllowed: () => ipcRenderer.invoke('is-remote-access-allowed'),

  // =====================================================
  // MODE SELECTION
  // =====================================================
  /** IPC: Switches the active mode ('home' | 'office') and loads the matching page */
  selectMode: (mode) => ipcRenderer.invoke('select-mode', mode),
  /** IPC: Returns to the mode-selection page */
  goBack: () => ipcRenderer.invoke('go-back'),
  /** IPC: Returns the currently selected mode string or null before selection */
  getCurrentMode: () => ipcRenderer.invoke('get-current-mode'),

  // =====================================================
  // SETUP
  // =====================================================
  /** IPC: True if the first-run setup wizard has already been completed */
  isSetupCompleted: () => ipcRenderer.invoke('is-setup-completed'),
  /** IPC: Marks the setup wizard as completed */
  completeSetup: () => ipcRenderer.invoke('complete-setup'),
  /** IPC: Navigates to the correct active page for the current mode */
  navigateToMain: () => ipcRenderer.invoke('navigate-to-main'),
  /** IPC: Navigates to the first-run setup wizard */
  navigateToSetup: () => ipcRenderer.invoke('navigate-to-setup'),
  /** IPC: Navigates to the help page */
  navigateToHelp: () => ipcRenderer.invoke('navigate-to-help'),

  // =====================================================
  // TAILSCALE
  // =====================================================
  /** IPC: Gets current Tailscale daemon and connectivity status */
  tailscaleStatus: () => ipcRenderer.invoke('tailscale-status'),
  /** IPC: Installs Tailscale; fires progress events via 'tailscale-install-progress' */
  tailscaleInstall: () => ipcRenderer.invoke('tailscale-install'),
  /** IPC: Logs in the Tailscale CLI */
  tailscaleLogin: () => ipcRenderer.invoke('tailscale-login'),
  /** IPC: Opens the Tailscale admin web UI */
  tailscaleOpenAdmin: () => ipcRenderer.invoke('tailscale-open-admin'),
  /** IPC: Subscribes to Tailscale install progress events */
  onTailscaleInstallProgress: (callback) => {
    return ipcRenderer.on('tailscale-install-progress', (event, progress) => callback(progress));
  },

  // =====================================================
  // PARSEC
  // =====================================================
  /** IPC: Gets Parsec runtime status (installed/running) */
  parsecStatus: () => ipcRenderer.invoke('parsec-status'),
  /** IPC: Installs Parsec; fires progress events via 'parsec-install-progress' */
  parsecInstall: () => ipcRenderer.invoke('parsec-install'),
  /** IPC: Opens the Parsec window */
  parsecOpen: () => ipcRenderer.invoke('parsec-open'),
  /** IPC: Starts the Parsec streaming session */
  parsecStart: () => ipcRenderer.invoke('parsec-start'),
  /** IPC: Subscribes to Parsec install progress events */
  onParsecInstallProgress: (callback) => {
    return ipcRenderer.on('parsec-install-progress', (event, progress) => callback(progress));
  },

  // =====================================================
  // DEVICES
  // =====================================================
  /** IPC: Returns the current list of connected ADB devices */
  getDevices: () => ipcRenderer.invoke('get-devices'),
  /** IPC: Forces a live ADB re-scan and returns an updated device list */
  refreshDevices: () => ipcRenderer.invoke('refresh-devices'),
  /** IPC: Returns ADB server status (running/version) */
  adbStatus: () => ipcRenderer.invoke('adb-status'),
  /** IPC: Subscribes to device-list-change events */
  onDevicesUpdated: (callback) => {
    return ipcRenderer.on('devices-updated', (event, devices) => callback(devices));
  },
  /** IPC: Subscribes to a single device's connection event */
  onDeviceConnected: (callback) => {
    return ipcRenderer.on('device-connected', (event, device) => callback(device));
  },
  /** IPC: Subscribes to a single device's disconnection event */
  onDeviceDisconnected: (callback) => {
    return ipcRenderer.on('device-disconnected', (event, device) => callback(device));
  },

  // =====================================================
  // SCRCPY
  // =====================================================
  /** IPC: Returns scrcpy runtime status */
  scrcpyStatus: () => ipcRenderer.invoke('scrcpy-status'),
  /** IPC: Starts scrcpy mirror for every connected ADB device */
  scrcpyStartAll: () => ipcRenderer.invoke('scrcpy-start-all'),
  /** IPC: Stops all running scrcpy mirrors */
  scrcpyStopAll: () => ipcRenderer.invoke('scrcpy-stop-all'),
  /** IPC: Starts scrcpy mirror for one device */
  scrcpyStartDevice: (deviceId) => ipcRenderer.invoke('scrcpy-start-device', deviceId),
  /** IPC: Stops the scrcpy mirror for one device */
  scrcpyStopDevice: (deviceId) => ipcRenderer.invoke('scrcpy-stop-device', deviceId),
  /** IPC: Returns the current scrcpy mirror options */
  scrcpyGetOptions: () => ipcRenderer.invoke('scrcpy-get-options'),
  /** IPC: Persists partial scrcpy mirror options */
  scrcpySetOptions: (options) => ipcRenderer.invoke('scrcpy-set-options', options),
  /** IPC: Subscribes to scrcpy window-start events */
  onScrcpyWindowStarted: (callback) => {
    return ipcRenderer.on('scrcpy-window-started', (event, data) => callback(data));
  },
  /** IPC: Subscribes to scrcpy window-close events */
  onScrcpyWindowClosed: (callback) => {
    return ipcRenderer.on('scrcpy-window-closed', (event, data) => callback(data));
  },
  /** IPC: Subscribes to scrcpy window-error events */
  onScrcpyWindowError: (callback) => {
    return ipcRenderer.on('scrcpy-window-error', (event, data) => callback(data));
  },

  // =====================================================
  // ADB TEXT INPUT
  // =====================================================
  /** IPC: Sends a text string to a device via adb shell input text */
  sendTextToDevice: (deviceId, text) => ipcRenderer.invoke('send-text-to-device', deviceId, text),
  /** IPC: Sends a key event to a device via adb shell input keyevent */
  sendKeyToDevice: (deviceId, keycode) => ipcRenderer.invoke('send-key-to-device', deviceId, keycode),

  // =====================================================
  // AUTOSTART
  // =====================================================
  /** IPC: Returns whether OS-startup registration is active */
  autostartStatus: () => ipcRenderer.invoke('autostart-status'),
  /** IPC: Enables OS auto-start on boot */
  autostartEnable: () => ipcRenderer.invoke('autostart-enable'),
  /** IPC: Disables OS auto-start on boot */
  autostartDisable: () => ipcRenderer.invoke('autostart-disable'),
  /** IPC: Toggles OS auto-start on boot */
  autostartToggle: () => ipcRenderer.invoke('autostart-toggle'),
  /** IPC: Returns the full autostart configuration object */
  getAutostartSettings: () => ipcRenderer.invoke('get-autostart-settings'),
  /** IPC: Merges partial autostart settings and persists them */
  updateAutostartSettings: (settings) => ipcRenderer.invoke('update-autostart-settings', settings),

  // =====================================================
  // FULL STATUS
  // =====================================================
  /** IPC: Returns a consolidated snapshot of all subsystem statuses */
  getFullStatus: () => ipcRenderer.invoke('get-full-status'),

  // =====================================================
  // DEVICE CUSTOMIZATION
  // =====================================================
  /** IPC: get-device-data */
  getDeviceData: (deviceId) => ipcRenderer.invoke('get-device-data', deviceId),
  /** IPC: Persists partial customisation data for one device */
  saveDeviceData: (deviceId, data) => ipcRenderer.invoke('save-device-data', deviceId, data),
  /** IPC: Removes all stored customisation data for one device */
  deleteDeviceData: (deviceId) => ipcRenderer.invoke('delete-device-data', deviceId),
  /** IPC: Returns all stored device customisation records, including non-connected devices */
  getAllDeviceData: () => ipcRenderer.invoke('get-all-device-data'),
  /** IPC: Batch-updates on-screen grid positions for multiple devices */
  updateDevicePositions: (positions) => ipcRenderer.invoke('update-device-positions', positions),
  /** IPC: get-groups */
  getGroups: () => ipcRenderer.invoke('get-groups'),
  /** IPC: add-group */
  addGroup: (name) => ipcRenderer.invoke('add-group', name),
  /** IPC: Removes a device group by name */
  removeGroup: (name) => ipcRenderer.invoke('remove-group', name),
  /** IPC: Renames an existing device group */
  renameGroup: (oldName, newName) => ipcRenderer.invoke('rename-group', oldName, newName),
  /** IPC: get-merged-devices */
  getMergedDevices: () => ipcRenderer.invoke('get-merged-devices'),
  /** IPC: get-device-store-settings */
  getDeviceStoreSettings: () => ipcRenderer.invoke('get-device-store-settings'),
  /** IPC: set-device-store-setting */
  setDeviceStoreSetting: (key, value) => ipcRenderer.invoke('set-device-store-setting', key, value),
  /** IPC: Serialises and returns all device-store data for export */
  exportDeviceData: () => ipcRenderer.invoke('export-device-data'),
  /** IPC: Replaces device-store data with a previously exported payload */
  importDeviceData: (data) => ipcRenderer.invoke('import-device-data', data),

  // =====================================================
  // NOTIFICATIONS
  // =====================================================
  /** IPC: Returns the current notification settings */
  getNotificationSettings: () => ipcRenderer.invoke('get-notification-settings'),
  /** IPC: Enables or disables all notifications */
  setNotificationEnabled: (enabled) => ipcRenderer.invoke('set-notification-enabled', enabled),
  /** IPC: Enables or disables notification sound */
  setNotificationSound: (enabled) => ipcRenderer.invoke('set-notification-sound', enabled),
  /** IPC: Merges partial notification settings and persists them */
  updateNotificationSettings: (settings) => ipcRenderer.invoke('update-notification-settings', settings),

  // =====================================================
  // SHORTCUTS
  // =====================================================
  /** IPC: Returns the list of registered keyboard shortcuts */
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),

  // =====================================================
  // FARM STATE
  // =====================================================
  /** IPC: Sets whether the farm loop is actively running */
  setFarmRunning: (running) => ipcRenderer.invoke('set-farm-running', running),
  /** IPC: Returns whether the farm loop is currently running */
  getFarmRunning: () => ipcRenderer.invoke('get-farm-running'),

  // =====================================================
  // HOME COMPUTER (Office mode)
  // =====================================================
  /** IPC: Returns the stored home-computer display name (empty string if unset) */
  getHomeComputerName: () => ipcRenderer.invoke('get-home-computer-name'),
  /** IPC: Saves the home-computer display name */
  setHomeComputerName: (name) => ipcRenderer.invoke('set-home-computer-name', name),

  // =====================================================
  // ABOUT
  // =====================================================
  /** IPC: Opens the About modal window */
  openAbout: () => ipcRenderer.invoke('open-about'),
  /** IPC: Closes the About modal window */
  closeAbout: () => ipcRenderer.invoke('close-about'),
  /** IPC: Returns app metadata (name, version, electron/node/chrome versions) */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // =====================================================
  // UTILITY
  // =====================================================
  /** IPC: Opens a URL in the OS default browser */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  /** IPC: Minimises the main application window */
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  /** IPC: Gracefully quits the application */
  quitApp: () => ipcRenderer.invoke('quit-app')
});

if (process.env?.DEBUG) console.log('[Preload] Phone Farm preload script loaded');
