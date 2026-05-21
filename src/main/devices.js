// =====================================================
// PHONE FARM V2 - DEVICE MONITOR
// Unified Application
// =====================================================

const EventEmitter = require('events');

class DeviceMonitor extends EventEmitter {
  constructor(adbManager, autostartManager, scrcpyManager) {
    super();
    this.adb = adbManager;
    this.autostartManager = autostartManager;
    this.scrcpyManager = scrcpyManager;
    this.devices = new Map();
    this.pollInterval = null;
    this.pollDelay = 3000;
    this.isPolling = false;
  }

  /**
   * Start monitoring devices
   */
  start() {
    if (this.pollInterval) {
      return;
    }

    if (process.env?.DEBUG) console.log('[DeviceMonitor] Starting...');
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), this.pollDelay);
  }

  /**
   * Stop monitoring devices
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (process.env?.DEBUG) console.log('[DeviceMonitor] Stopped');
  }

  /**
   * Set poll interval
   */
  setPollDelay(ms) {
    this.pollDelay = ms;
    if (this.pollInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Poll for device changes
   */
  async poll() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    if (process.env?.DEBUG) console.log('[DeviceMonitor] Polling for devices...');

    try {
      const result = await this.adb.getEnrichedDevices();
      if (process.env?.DEBUG) console.log('[DeviceMonitor] Poll result:', JSON.stringify(result, null, 2));

      if (!result.success) {
        console.error('[DeviceMonitor] Poll error:', result.error);
        this.isPolling = false;
        return;
      }

      const currentDevices = new Map();
      const newDevices = [];
      const disconnectedDevices = [];

      // Process current devices
      for (const device of result.devices) {
        currentDevices.set(device.id, device);

        // Check if this is a new device
        if (!this.devices.has(device.id)) {
          newDevices.push(device);
        }
      }

      // Check for disconnected devices
      for (const [id, device] of this.devices) {
        if (!currentDevices.has(id)) {
          disconnectedDevices.push(device);
        }
      }

      // Update device list
      this.devices = currentDevices;

      // Emit events
      if (newDevices.length > 0 || disconnectedDevices.length > 0) {
        this.emit('devices-changed', Array.from(this.devices.values()));
      }

      for (const device of newDevices) {
        if (process.env?.DEBUG) console.log('[DeviceMonitor] Device connected:', device.id);
        this.emit('device-connected', device);
      }

      if (newDevices.length > 0 && this.autostartManager?.getAutoStartFarm()) {
        const delay = this.autostartManager.getAutoStartDelay();
        const active = this.scrcpyManager ? this.scrcpyManager.getActiveDevices() : [];
        const newIds = newDevices.filter(d => !active.includes(d.id)).map(d => d.id);

        if (newIds.length > 0) {
          if (process.env?.DEBUG) console.log('[DeviceMonitor] Auto-start farm in', delay, 'ms for', newIds.length, 'devices');
          setTimeout(() => {
            for (const id of newIds) {
              this.scrcpyManager?.startDevice(id).catch(e =>
                console.error('[DeviceMonitor] Auto-start failed for', id, e.message)
              );
            }
          }, delay);
        }
      }

      for (const device of disconnectedDevices) {
        if (process.env?.DEBUG) console.log('[DeviceMonitor] Device disconnected:', device.id);
        this.emit('device-disconnected', device);
      }

    } catch (e) {
      console.error('[DeviceMonitor] Poll exception:', e.message);
    }

    this.isPolling = false;
  }

  /**
   * Force refresh
   */
  async refresh() {
    await this.poll();
    return Array.from(this.devices.values());
  }

  /**
   * Get current device list
   */
  getDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get device by ID
   */
  getDevice(id) {
    return this.devices.get(id);
  }

  /**
   * Get device count
   */
  getDeviceCount() {
    return this.devices.size;
  }
}

module.exports = DeviceMonitor;
