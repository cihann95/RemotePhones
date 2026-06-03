// =====================================================
// PHONE FARM V2 - HEALTH MONITOR
// Runtime health monitoring for Electron app
// =====================================================

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class HealthMonitor {
  /**
   * @param {Object} dependencies - Required managers and utilities
   * @param {Object} dependencies.adbManager - ADB manager instance
   * @param {Object} dependencies.licenseManager - License manager instance
   * @param {Object} dependencies.deviceStore - Device store instance
   * @param {Object} dependencies.paths - Paths utility instance
   */
  constructor({ adbManager, licenseManager, deviceStore, paths }) {
    this.adbManager = adbManager;
    this.licenseManager = licenseManager;
    this.deviceStore = deviceStore;
    this.paths = paths;
    
    this.healthData = {
      adbRunning: false,
      devicesConnected: 0,
      licenseValid: false,
      diskSpace: { free: 0, total: 0, unit: 'MB' },
      memoryUsage: { rss: 0, heapUsed: 0, unit: 'MB' },
      lastUpdated: null,
      criticalAlerts: []
    };
    
    this.lastHealthData = null;
    this.criticalCallbacks = [];
    this.intervalId = null;
    this.checkInterval = 60 * 1000; // 60 seconds
    
    // Thresholds for critical alerts
    this.DISK_SPACE_THRESHOLD_MB = 100; // Alert if less than 100MB free
    this.MEMORY_THRESHOLD_MB = 500;     // Alert if more than 500MB used
  }
  
  /**
   * Initialize the health monitor and start periodic checks
   */
  init() {
    // Run immediate check
    this.checkHealth();
    
    // Set up periodic checks
    this.intervalId = setInterval(() => this.checkHealth(), this.checkInterval);
    
    console.debug('[Health Monitor] Initialized with 60s interval');
  }
  
  /**
   * Stop the health monitor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.debug('[Health Monitor] Stopped');
    }
  }
  
  /**
   * Perform health check and update internal state
   */
  async checkHealth() {
    const timestamp = new Date().toISOString();
    const alerts = [];
    
    try {
      // Check ADB service status
      const adbRunning = await this.checkAdbStatus();
      
      // Check device connectivity
      const devicesConnected = await this.checkDeviceConnectivity();
      
      // Check license status
      const licenseValid = await this.checkLicenseStatus();
      
      // Check disk space
      const diskSpace = this.checkDiskSpace();
      
      // Check memory usage
      const memoryUsage = this.checkMemoryUsage();
      
      // Build new health data
      const newHealthData = {
        adbRunning,
        devicesConnected,
        licenseValid,
        diskSpace,
        memoryUsage,
        lastUpdated: timestamp,
        criticalAlerts: alerts
      };
      
      // Detect changes and generate alerts
      if (this.lastHealthData) {
        // ADB status change
        if (this.lastHealthData.adbRunning !== adbRunning) {
          if (!adbRunning) {
            alerts.push('ADB service is not running');
            console.warn('[Health Monitor] ADB service stopped');
          } else {
            console.debug('[Health Monitor] ADB service started');
          }
        }
        
        // Device connectivity change
        if (this.lastHealthData.devicesConnected !== devicesConnected) {
          if (devicesConnected === 0 && this.lastHealthData.devicesConnected > 0) {
            alerts.push('All devices disconnected');
            console.warn('[Health Monitor] All devices disconnected');
          } else if (devicesConnected > 0 && this.lastHealthData.devicesConnected === 0) {
            console.debug('[Health Monitor] Devices reconnected');
          }
        }
        
        // License status change
        if (this.lastHealthData.licenseValid !== licenseValid) {
          if (!licenseValid) {
            alerts.push('License is invalid or expired');
            console.warn('[Health Monitor] License invalid or expired');
          } else {
            console.debug('[Health Monitor] License validated');
          }
        }
        
        // Disk space critical
        if (diskSpace.free < this.DISK_SPACE_THRESHOLD_MB && 
            this.lastHealthData.diskSpace.free >= this.DISK_SPACE_THRESHOLD_MB) {
          alerts.push(`Low disk space: ${diskSpace.free.toFixed(0)}MB free`);
          console.warn(`[Health Monitor] Low disk space: ${diskSpace.free.toFixed(0)}MB free`);
        }
        
        // Memory usage critical
        if (memoryUsage.heapUsed > this.MEMORY_THRESHOLD_MB && 
            this.lastHealthData.memoryUsage.heapUsed <= this.MEMORY_THRESHOLD_MB) {
          alerts.push(`High memory usage: ${memoryUsage.heapUsed.toFixed(0)}MB`);
          console.warn(`[Health Monitor] High memory usage: ${memoryUsage.heapUsed.toFixed(0)}MB`);
        }
      }
      
      // Update health data
      this.lastHealthData = { ...newHealthData };
      this.healthData = newHealthData;
      
      // Trigger critical callbacks if any alerts
      if (alerts.length > 0) {
        this.triggerCriticalCallbacks(alerts);
      }
    } catch (error) {
      console.error('[Health Monitor] Error during health check:', error);
      // Still update timestamp to avoid stale data
      this.healthData.lastUpdated = timestamp;
      this.healthData.criticalAlerts = ['Health check failed: ' + error.message];
    }
  }
  
  /**
   * Check if ADB service is running
   * @returns {Promise<boolean>}
   */
  checkAdbStatus() {
    return new Promise((resolve) => {
      exec('adb version', (error, stdout, stderr) => {
        if (!error && stdout.includes('Android Debug Bridge')) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }
  
  /**
   * Check how many devices are connected
   * @returns {Promise<number>}
   */
  checkDeviceConnectivity() {
    return new Promise((resolve) => {
      // Use the deviceStore to get connected devices
      try {
        const devices = this.deviceStore.getAll ? this.deviceStore.getAll() : [];
        resolve(devices.length);
      } catch (error) {
        console.warn('[Health Monitor] Could not get device count from store:', error);
        // Fallback to adb devices
        exec('adb devices', (error, stdout, stderr) => {
          if (error) {
            resolve(0);
            return;
          }
          // Parse output: first line is header, then each device line
          const lines = stdout.trim().split('\n');
          // Skip header line, count non-empty lines that contain a device
          const deviceLines = lines.slice(1).filter(line => line.trim() && !line.includes('List of devices'));
          resolve(deviceLines.length);
        });
      }
    });
  }
  
  /**
   * Check if license is still valid
   * @returns {Promise<boolean>}
   */
  checkLicenseStatus() {
    return new Promise((resolve) => {
      try {
        // Assuming licenseManager has an isValid method
        if (typeof this.licenseManager.isValid === 'function') {
          resolve(this.licenseManager.isValid());
        } else if (typeof this.licenseManager.checkLicense === 'function') {
          this.licenseManager.checkLicense().then(valid => resolve(valid)).catch(() => resolve(false));
        } else {
          // Fallback: check if license file exists and is recent
          const licensePath = path.join(this.paths.getAppDataPath(), 'license.json');
          if (fs.existsSync(licensePath)) {
            const stat = fs.statSync(licensePath);
            const ageInDays = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
            resolve(ageInDays < 365); // License valid for 1 year
          } else {
            resolve(false);
          }
        }
      } catch (error) {
        console.warn('[Health Monitor] License check failed:', error);
        resolve(false);
      }
    });
  }
  
  /**
   * Check disk space for the app data directory
   * @returns {Object} { free: number, total: number, unit: 'MB' }
   */
  checkDiskSpace() {
    try {
      const appDataPath = this.paths.getAppDataPath();
      const stats = fs.statvfs ? fs.statvfsSync(appDataPath) : null;
      
      if (stats) {
        const freeBytes = stats.free * stats.bsize;
        const totalBytes = stats.total * stats.bsize;
        return {
          free: freeBytes / (1024 * 1024),
          total: totalBytes / (1024 * 1024),
          unit: 'MB'
        };
      } else {
        // Fallback for Windows using wmic or checking drive space
        const drive = appDataPath.split(':')[0] + ':';
        const execSync = require('child_process').execSync;
        try {
          const output = execSync(`wmic logicaldisk where "deviceid='${drive}'" get freespace,size`).toString();
          const lines = output.trim().split('\n');
          if (lines.length >= 3) {
            const parts = lines[2].trim().split(/\s+/);
            const freeBytes = parseInt(parts[0], 10);
            const totalBytes = parseInt(parts[1], 10);
            return {
              free: freeBytes / (1024 * 1024),
              total: totalBytes / (1024 * 1024),
              unit: 'MB'
            };
          }
        } catch (e) {
          console.warn('[Health Monitor] Could not get disk space via wmic:', e);
        }
        
        // Return zeros if we can't determine
        return { free: 0, total: 0, unit: 'MB' };
      }
    } catch (error) {
      console.warn('[Health Monitor] Disk space check failed:', error);
      return { free: 0, total: 0, unit: 'MB' };
    }
  }
  
  /**
   * Check memory usage of the Electron process
   * @returns {Object} { rss: number, heapUsed: number, unit: 'MB' }
   */
  checkMemoryUsage() {
    try {
      const memory = process.memoryUsage();
      return {
        rss: memory.rss / (1024 * 1024),
        heapUsed: memory.heapUsed / (1024 * 1024),
        unit: 'MB'
      };
    } catch (error) {
      console.warn('[Health Monitor] Memory usage check failed:', error);
      return { rss: 0, heapUsed: 0, unit: 'MB' };
    }
  }
  
  /**
   * Get current health data
   * @returns {Object} Copy of health data
   */
  getHealth() {
    return { ...this.healthData };
  }
  
  /**
   * Register a callback for critical alerts
   * @param {Function} callback - Function to call with alerts array
   */
  onCritical(callback) {
    if (typeof callback === 'function') {
      this.criticalCallbacks.push(callback);
    }
  }
  
  /**
   * Trigger all critical callbacks with alerts
   * @param {Array} alerts - Array of alert strings
   */
  triggerCriticalCallbacks(alerts) {
    this.criticalCallbacks.forEach(callback => {
      try {
        callback(alerts);
      } catch (error) {
        console.error('[Health Monitor] Error in critical callback:', error);
      }
    });
  }
}

module.exports = HealthMonitor;