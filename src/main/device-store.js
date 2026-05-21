// =====================================================
// PHONE FARM V2 - DEVICE STORE
// Persistent storage for device customization
// =====================================================

const Store = require('electron-store');

class DeviceStore {
  constructor() {
    this.store = new Store({
      name: 'device-data',
      defaults: {
        devices: {},
        groups: ['Varsayilan'],
        settings: {
          showOfflineDevices: true,
          sortBy: 'name',
          groupByGroup: true
        }
      }
    });
  }

  // ==================== DEVICE DATA ====================

  /**
   * Get data for a specific device
   */
  getDeviceData(deviceId) {
    return this.store.get(`devices.${deviceId}`, null);
  }

  /**
   * Save data for a device
   */
  saveDeviceData(deviceId, data) {
    const existing = this.getDeviceData(deviceId) || {};
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };
    this.store.set(`devices.${deviceId}`, updated);
    return updated;
  }

  /**
   * Delete data for a device
   */
  deleteDeviceData(deviceId) {
    this.store.delete(`devices.${deviceId}`);
  }

  /**
   * Get all device data
   */
  getAllDeviceData() {
    return this.store.get('devices', {});
  }

  /**
   * Update device positions (for drag and drop)
   */
  updateDevicePositions(positions) {
    for (const [deviceId, position] of Object.entries(positions)) {
      const data = this.getDeviceData(deviceId) || {};
      data.position = position;
      this.saveDeviceData(deviceId, data);
    }
  }

  /**
   * Merge device data with ADB device info
   */
  mergeDeviceData(adbDevices) {
    const allData = this.getAllDeviceData();
    const mergedDevices = [];

    for (const device of adbDevices) {
      const stored = allData[device.id] || {};
      mergedDevices.push({
        ...device,
        customName: stored.customName || null,
        emoji: stored.emoji || null,
        color: stored.color || null,
        group: stored.group || 'Varsayilan',
        notes: stored.notes || '',
        position: stored.position || 0
      });
    }

    // Sort by position
    mergedDevices.sort((a, b) => (a.position || 0) - (b.position || 0));

    return mergedDevices;
  }

  // ==================== GROUPS ====================

  /**
   * Get all groups
   */
  getGroups() {
    return this.store.get('groups', ['Varsayilan']);
  }

  /**
   * Add a new group
   */
  addGroup(name) {
    const groups = this.getGroups();
    if (!groups.includes(name)) {
      groups.push(name);
      this.store.set('groups', groups);
    }
    return groups;
  }

  /**
   * Remove a group
   */
  removeGroup(name) {
    if (name === 'Varsayilan') {
      return this.getGroups(); // Can't remove default
    }

    const groups = this.getGroups().filter(g => g !== name);
    this.store.set('groups', groups);

    // Move devices from removed group to default
    const allData = this.getAllDeviceData();
    for (const [deviceId, data] of Object.entries(allData)) {
      if (data.group === name) {
        data.group = 'Varsayilan';
        this.saveDeviceData(deviceId, data);
      }
    }

    return groups;
  }

  /**
   * Rename a group
   */
  renameGroup(oldName, newName) {
    if (oldName === 'Varsayilan') {
      return this.getGroups(); // Can't rename default
    }

    const groups = this.getGroups().map(g => g === oldName ? newName : g);
    this.store.set('groups', groups);

    // Update devices in this group
    const allData = this.getAllDeviceData();
    for (const [deviceId, data] of Object.entries(allData)) {
      if (data.group === oldName) {
        data.group = newName;
        this.saveDeviceData(deviceId, data);
      }
    }

    return groups;
  }

  // ==================== SETTINGS ====================

  /**
   * Get settings
   */
  getSettings() {
    return this.store.get('settings', {});
  }

  /**
   * Set a setting
   */
  setSetting(key, value) {
    this.store.set(`settings.${key}`, value);
    return this.getSettings();
  }

  /**
   * Update multiple settings
   */
  updateSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      this.store.set(`settings.${key}`, value);
    }
    return this.getSettings();
  }

  // ==================== IMPORT/EXPORT ====================

  /**
   * Export all data
   */
  exportData() {
    return {
      devices: this.getAllDeviceData(),
      groups: this.getGroups(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import data
   */
  importData(data) {
    if (data.devices) {
      for (const [deviceId, deviceData] of Object.entries(data.devices)) {
        this.saveDeviceData(deviceId, deviceData);
      }
    }

    if (data.groups) {
      const currentGroups = this.getGroups();
      const newGroups = [...new Set([...currentGroups, ...data.groups])];
      this.store.set('groups', newGroups);
    }

    if (data.settings) {
      this.updateSettings(data.settings);
    }

    return { success: true };
  }

  /**
   * Clear all data
   */
  clearAll() {
    this.store.clear();
    // Restore defaults
    this.store.set('devices', {});
    this.store.set('groups', ['Varsayilan']);
    this.store.set('settings', {
      showOfflineDevices: true,
      sortBy: 'name',
      groupByGroup: true
    });
  }
}

module.exports = DeviceStore;
