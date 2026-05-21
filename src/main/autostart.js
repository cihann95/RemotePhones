// =====================================================
// PHONE FARM V2 - AUTOSTART MANAGER
// Windows startup management
// =====================================================

const { app } = require('electron');
const Store = require('electron-store');

class AutostartManager {
  constructor() {
    this.appName = 'PhoneFarm';
    this.store = new Store({
      name: 'autostart-settings',
      defaults: {
        openAtLogin: false,
        startMinimized: false,
        autoStartFarm: false,
        autoStartDelay: 3000,
        autoReconnect: true,
        reconnectDelay: 5000,
        maxReconnectAttempts: 3,
        rememberWindowLayout: true,
        lastWindowLayout: null
      }
    });
  }

  /**
   * Check if autostart is enabled
   */
  isEnabled() {
    try {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin === true;
    } catch (e) {
      console.error('[Autostart] Status check error:', e.message);
      return false;
    }
  }

  /**
   * Enable Windows startup
   */
  enable(startMinimized = false) {
    try {
      const args = startMinimized ? ['--start-minimized'] : [];

      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: startMinimized,
        path: process.execPath,
        args: args
      });

      this.store.set('openAtLogin', true);
      this.store.set('startMinimized', startMinimized);

      if (process.env?.DEBUG) console.log('[Autostart] Enabled', startMinimized ? '(minimized)' : '');
      return true;
    } catch (e) {
      console.error('[Autostart] Enable error:', e.message);
      return false;
    }
  }

  /**
   * Disable Windows startup
   */
  disable() {
    try {
      app.setLoginItemSettings({
        openAtLogin: false
      });

      this.store.set('openAtLogin', false);

      if (process.env?.DEBUG) console.log('[Autostart] Disabled');
      return true;
    } catch (e) {
      console.error('[Autostart] Disable error:', e.message);
      return false;
    }
  }

  /**
   * Toggle autostart
   */
  toggle() {
    if (this.isEnabled()) {
      return this.disable();
    } else {
      return this.enable(this.store.get('startMinimized', false));
    }
  }

  /**
   * Get auto farm start setting
   */
  getAutoStartFarm() {
    return this.store.get('autoStartFarm', false);
  }

  /**
   * Set auto farm start setting
   */
  setAutoStartFarm(enabled) {
    this.store.set('autoStartFarm', enabled);
    return enabled;
  }

  /**
   * Get auto start delay
   */
  getAutoStartDelay() {
    return this.store.get('autoStartDelay', 3000);
  }

  /**
   * Set auto start delay
   */
  setAutoStartDelay(delayMs) {
    this.store.set('autoStartDelay', delayMs);
    return delayMs;
  }

  /**
   * Get auto reconnect setting
   */
  getAutoReconnect() {
    return this.store.get('autoReconnect', true);
  }

  /**
   * Set auto reconnect setting
   */
  setAutoReconnect(enabled) {
    this.store.set('autoReconnect', enabled);
    return enabled;
  }

  /**
   * Get reconnect delay
   */
  getReconnectDelay() {
    return this.store.get('reconnectDelay', 5000);
  }

  /**
   * Set reconnect delay
   */
  setReconnectDelay(delayMs) {
    this.store.set('reconnectDelay', delayMs);
    return delayMs;
  }

  /**
   * Get max reconnect attempts
   */
  getMaxReconnectAttempts() {
    return this.store.get('maxReconnectAttempts', 3);
  }

  /**
   * Set max reconnect attempts
   */
  setMaxReconnectAttempts(count) {
    this.store.set('maxReconnectAttempts', count);
    return count;
  }

  /**
   * Check if should remember window layout
   */
  shouldRememberLayout() {
    return this.store.get('rememberWindowLayout', true);
  }

  /**
   * Set remember layout setting
   */
  setRememberLayout(enabled) {
    this.store.set('rememberWindowLayout', enabled);
    return enabled;
  }

  /**
   * Save window layout
   */
  saveWindowLayout(layout) {
    if (this.shouldRememberLayout()) {
      this.store.set('lastWindowLayout', {
        ...layout,
        savedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Get last window layout
   */
  getLastWindowLayout() {
    return this.store.get('lastWindowLayout', null);
  }

  /**
   * Clear saved window layout
   */
  clearWindowLayout() {
    this.store.delete('lastWindowLayout');
  }

  /**
   * Check if should start minimized
   */
  shouldStartMinimized() {
    if (process.argv.includes('--start-minimized')) {
      return true;
    }
    return this.store.get('startMinimized', false);
  }

  /**
   * Set start minimized setting
   */
  setStartMinimized(enabled) {
    this.store.set('startMinimized', enabled);

    if (this.isEnabled()) {
      this.enable(enabled);
    }

    return enabled;
  }

  /**
   * Get all settings
   */
  getAllSettings() {
    return {
      openAtLogin: this.isEnabled(),
      startMinimized: this.store.get('startMinimized', false),
      autoStartFarm: this.store.get('autoStartFarm', false),
      autoStartDelay: this.store.get('autoStartDelay', 3000),
      autoReconnect: this.store.get('autoReconnect', true),
      reconnectDelay: this.store.get('reconnectDelay', 5000),
      maxReconnectAttempts: this.store.get('maxReconnectAttempts', 3),
      rememberWindowLayout: this.store.get('rememberWindowLayout', true)
    };
  }

  /**
   * Update multiple settings
   */
  updateSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'openAtLogin') {
        if (value) {
          this.enable(settings.startMinimized || this.store.get('startMinimized', false));
        } else {
          this.disable();
        }
      } else {
        this.store.set(key, value);
      }
    }

    return this.getAllSettings();
  }

  /**
   * Get status (backward compatibility)
   */
  getStatus() {
    return {
      enabled: this.isEnabled(),
      execPath: process.execPath,
      ...this.getAllSettings()
    };
  }
}

module.exports = AutostartManager;
