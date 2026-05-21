// =====================================================
// PHONE FARM V2 - NOTIFICATION MANAGER
// Windows notification system
// =====================================================

const { Notification, app } = require('electron');
const path = require('path');

class NotificationManager {
  constructor() {
    this.enabled = true;
    this.soundEnabled = true;
    this.lastNotifications = new Map();
    this.cooldownMs = 5000;

    this.settings = {
      deviceConnected: true,
      deviceDisconnected: true,
      batteryLow: true,
      batteryCritical: true,
      scrcpyCrash: true,
      connectionStatus: true
    };

    this.batteryLowThreshold = 20;
    this.batteryCriticalThreshold = 10;
    this.notifiedBatteryLow = new Set();
    this.notifiedBatteryCritical = new Set();
  }

  /**
   * Check if notifications are supported
   */
  isSupported() {
    return Notification.isSupported();
  }

  /**
   * Enable/disable notifications
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Enable/disable sounds
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  /**
   * Update notification settings
   */
  updateSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Check cooldown for spam prevention
   */
  canNotify(key) {
    const lastTime = this.lastNotifications.get(key);
    const now = Date.now();

    if (lastTime && (now - lastTime) < this.cooldownMs) {
      return false;
    }

    this.lastNotifications.set(key, now);
    return true;
  }

  /**
   * Show notification
   */
  show(options) {
    if (!this.enabled || !this.isSupported()) {
      return null;
    }

    const { title, body, icon, urgency, silent, onClick } = options;

    try {
      const notification = new Notification({
        title: title || 'Phone Farm',
        body: body || '',
        icon: icon || this.getDefaultIcon(),
        silent: silent ?? !this.soundEnabled,
        urgency: urgency || 'normal',
        timeoutType: 'default'
      });

      if (onClick) {
        notification.on('click', onClick);
      }

      notification.show();
      return notification;
    } catch (e) {
      console.error('[Notifications] Show error:', e.message);
      return null;
    }
  }

  /**
   * Get default icon path
   */
  getDefaultIcon() {
    try {
      if (app.isPackaged) {
        return path.join(process.resourcesPath, 'icon.png');
      } else {
        return path.join(__dirname, '..', '..', 'assets', 'icon.ico');
      }
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Device connected notification
   */
  deviceConnected(device) {
    if (!this.settings.deviceConnected) return;
    if (!this.canNotify(`connect-${device.id}`)) return;

    const name = device.customName || device.model || 'Telefon';
    const emoji = device.emoji || '';

    this.show({
      title: `${emoji} Telefon Baglandi`.trim(),
      body: `${name} kullanima hazir`,
      urgency: 'low'
    });
  }

  /**
   * Device disconnected notification
   */
  deviceDisconnected(device) {
    if (!this.settings.deviceDisconnected) return;
    if (!this.canNotify(`disconnect-${device.id}`)) return;

    const name = device.customName || device.model || 'Telefon';
    const emoji = device.emoji || '';

    this.show({
      title: `${emoji} Baglanti Kesildi`.trim(),
      body: `${name} cikarildi`,
      urgency: 'normal'
    });

    this.notifiedBatteryLow.delete(device.id);
    this.notifiedBatteryCritical.delete(device.id);
  }

  /**
   * Check battery and notify if needed
   */
  checkBattery(device) {
    if (!device.battery && device.battery !== 0) return;

    const name = device.customName || device.model || 'Telefon';
    const emoji = device.emoji || '';
    const battery = device.battery;

    if (battery <= this.batteryCriticalThreshold) {
      if (!this.notifiedBatteryCritical.has(device.id)) {
        if (this.settings.batteryCritical) {
          this.show({
            title: `Kritik Batarya Uyarisi`,
            body: `${emoji} ${name} bataryasi %${battery} - Hemen sarj edin!`.trim(),
            urgency: 'critical'
          });
        }
        this.notifiedBatteryCritical.add(device.id);
      }
    } else if (battery <= this.batteryLowThreshold) {
      if (!this.notifiedBatteryLow.has(device.id)) {
        if (this.settings.batteryLow) {
          this.show({
            title: `Dusuk Batarya`,
            body: `${emoji} ${name} bataryasi %${battery}`.trim(),
            urgency: 'normal'
          });
        }
        this.notifiedBatteryLow.add(device.id);
      }
    } else {
      if (battery > this.batteryLowThreshold + 5) {
        this.notifiedBatteryLow.delete(device.id);
      }
      if (battery > this.batteryCriticalThreshold + 5) {
        this.notifiedBatteryCritical.delete(device.id);
      }
    }
  }

  /**
   * Scrcpy window crashed notification
   */
  scrcpyCrashed(device) {
    if (!this.settings.scrcpyCrash) return;
    if (!this.canNotify(`crash-${device.id}`)) return;

    const name = device.customName || device.model || 'Telefon';
    const emoji = device.emoji || '';

    this.show({
      title: `Pencere Kapandi`,
      body: `${emoji} ${name} ekrani yeniden aciliyor...`.trim(),
      urgency: 'normal'
    });
  }

  /**
   * Connection status notification
   */
  connectionStatus(isConnected, service) {
    if (!this.settings.connectionStatus) return;
    if (!this.canNotify(`connection-${service}`)) return;

    if (isConnected) {
      this.show({
        title: `Baglanti Kuruldu`,
        body: `${service} baglantisi aktif`,
        urgency: 'low'
      });
    } else {
      this.show({
        title: `Baglanti Kesildi`,
        body: `${service} baglantisi koptu`,
        urgency: 'critical'
      });
    }
  }

  /**
   * Farm started notification
   */
  farmStarted(deviceCount) {
    if (!this.canNotify('farm-start')) return;

    this.show({
      title: `Phone Farm Baslatildi`,
      body: `${deviceCount} telefon hazir`,
      urgency: 'low'
    });
  }

  /**
   * Farm stopped notification
   */
  farmStopped() {
    if (!this.canNotify('farm-stop')) return;

    this.show({
      title: `Phone Farm Durduruldu`,
      body: `Tum pencereler kapatildi`,
      urgency: 'low'
    });
  }

  /**
   * Multiple devices connected notification
   */
  multipleDevicesConnected(count) {
    if (!this.settings.deviceConnected) return;
    if (!this.canNotify('multi-connect')) return;

    this.show({
      title: `${count} Telefon Baglandi`,
      body: `Yeni cihazlar algilandi`,
      urgency: 'normal'
    });
  }

  /**
   * Get settings for UI
   */
  getSettings() {
    return {
      enabled: this.enabled,
      soundEnabled: this.soundEnabled,
      ...this.settings,
      batteryLowThreshold: this.batteryLowThreshold,
      batteryCriticalThreshold: this.batteryCriticalThreshold
    };
  }

  /**
   * Set battery thresholds
   */
  setBatteryThresholds(low, critical) {
    if (low !== undefined) this.batteryLowThreshold = low;
    if (critical !== undefined) this.batteryCriticalThreshold = critical;
  }
}

module.exports = NotificationManager;
