// =====================================================
// PHONE FARM V2 - HEALTH MONITOR
// Runtime health monitoring for Electron app
// =====================================================

const fs = require('fs');
const path = require('path');

class HealthMonitor {
  /**
   * @param {Object} dependencies - Required managers and utilities
   * @param {Object} dependencies.adbManager - ADB manager instance
   * @param {Object} dependencies.licenseManager - License manager instance
   * @param {Object} dependencies.deviceStore - Device store instance
   * @param {Object} dependencies.paths - Paths utility instance
   * @param {Object} [dependencies.notificationManager] - Optional NotificationManager for failure alerts
   */
  constructor({ adbManager, licenseManager, deviceStore, paths, notificationManager }) {
    this.adbManager = adbManager;
    this.licenseManager = licenseManager;
    this.deviceStore = deviceStore;
    this.paths = paths;
    this.notificationManager = notificationManager || null;

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

    // ADB auto-restart rate limiting and backoff
    this.restartHistory = [];
    this.MAX_RESTARTS_PER_HOUR = 3;
    this.RESTART_WINDOW_MS = 60 * 60 * 1000;
    
    this.adbRestartAttempts = 0;
    this.MAX_ADB_RESTART_ATTEMPTS = 3;
    this.adbRestartBackoffMs = 5000; // 5 seconds initial backoff
    this.MAX_ADB_RESTART_BACKOFF_MS = 60000; // 60 seconds max backoff
    this.isRestartingAdb = false;
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
      
      // Handle first run ADB check
      if (!this.lastHealthData && !adbRunning) {
        console.warn('[Health Monitor] ADB service not running on startup, attempting auto-restart...');
        this.attemptAdbRestart();
      }

      // Detect changes and generate alerts
      if (this.lastHealthData) {
        // ADB status change and auto-restart
        if (!adbRunning) {
          if (this.lastHealthData.adbRunning) {
            alerts.push('ADB service is not running');
            console.warn('[Health Monitor] ADB service stopped, attempting auto-restart...');
          } else {
            console.warn('[Health Monitor] ADB service still not running, scheduling retry...');
          }
          this.attemptAdbRestart();
        } else if (!this.lastHealthData.adbRunning) {
          console.debug('[Health Monitor] ADB service recovered');
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
   * Check if ADB service is running and responsive
   * @returns {Promise<boolean>}
   */
  checkAdbStatus() {
    if (!this.adbManager || typeof this.adbManager.runCommand !== 'function') {
      return Promise.resolve(false);
    }
    return this.adbManager.runCommand(['devices'], { timeout: 5000 })
      .then(({ stdout }) => {
        return !!(stdout && stdout.includes('List of devices'));
      })
      .catch(() => false);
  }

  /**
   * Automatically restart the ADB server via adbManager (BaseToolManager pattern).
   * Falls back to a console warning (no crash) when adbManager/notificationManager
   * are not provided so older callers/tests still work.
   * @returns {Promise<boolean>} True if restart was successful, false otherwise
   */
  async restartAdbServer() {
    const now = Date.now();
    this.restartHistory = this.restartHistory.filter(time => now - time < this.RESTART_WINDOW_MS);

    if (this.restartHistory.length >= this.MAX_RESTARTS_PER_HOUR) {
      console.error('[Health Monitor] ADB restart rate limit exceeded. Max 3 restarts per hour.');
      this.notifyAdbRestartFailure('ADB restart rate limit exceeded (3/hour).');
      return false;
    }

    if (!this.adbManager || typeof this.adbManager.startServer !== 'function') {
      console.warn('[Health Monitor] adbManager not available; cannot restart ADB server.');
      this.notifyAdbRestartFailure('adbManager dependency is missing.');
      return false;
    }

    console.log('[Health Monitor] Attempting to restart ADB server...');
    this.restartHistory.push(now);

    try {
      if (typeof this.adbManager.stopServer === 'function') {
        const stopResult = await this.adbManager.stopServer();
        if (!stopResult || !stopResult.success) {
          console.warn('[Health Monitor] Error killing ADB server:', stopResult && stopResult.error);
        }
      }

      const startResult = await this.adbManager.startServer();
      if (startResult && startResult.success) {
        console.log('[Health Monitor] ADB server restarted successfully');
        return true;
      }

      console.error('[Health Monitor] Failed to start ADB server:', startResult && startResult.error);
      this.notifyAdbRestartFailure(startResult && startResult.error ? `start-server failed: ${startResult.error}` : undefined);
      return false;
    } catch (e) {
      console.error('[Health Monitor] ADB restart threw:', e && e.message ? e.message : e);
      this.notifyAdbRestartFailure(e && e.message ? e.message : undefined);
      return false;
    }
  }

  /**
   * Notify the user (via injected notificationManager) that ADB could not be
   * restarted automatically. Defensive: silently no-ops if notificationManager
   * is missing or the show() call throws.
   * @param {string} [reason] - Optional internal reason for log correlation.
   */
  notifyAdbRestartFailure(reason) {
    if (!this.notificationManager || typeof this.notificationManager.show !== 'function') {
      console.warn('[Health Monitor] notificationManager not available; skipping user notification.');
      return;
    }

    try {
      this.notificationManager.show({
        title: 'ADB Server Failed',
        body: 'ADB server could not be restarted automatically. Please reconnect your device.',
        type: 'error',
        urgency: 'critical'
      });
      if (reason) {
        console.log('Notified user of ADB restart failure:', reason);
      } else {
        console.log('Notified user of ADB restart failure');
      }
    } catch (e) {
      console.warn('[Health Monitor] Notification dispatch failed:', e && e.message ? e.message : e);
    }
  }

  /**
   * Attempt to restart ADB server with backoff and retry limits
   */
  async attemptAdbRestart() {
    if (this.isRestartingAdb) {
      console.debug('[Health Monitor] ADB restart already in progress or scheduled.');
      return;
    }

    if (this.adbRestartAttempts >= this.MAX_ADB_RESTART_ATTEMPTS) {
      console.error('[Health Monitor] Max ADB restart attempts reached. Manual intervention required.');
      this.notifyAdbRestartFailure(`Max consecutive restart attempts (${this.MAX_ADB_RESTART_ATTEMPTS}) reached.`);
      return;
    }

    this.isRestartingAdb = true;
    const delay = this.adbRestartBackoffMs;
    console.log(`[Health Monitor] Scheduling ADB restart in ${delay}ms (attempt ${this.adbRestartAttempts + 1}/${this.MAX_ADB_RESTART_ATTEMPTS})`);

    setTimeout(async () => {
      const success = await this.restartAdbServer();
      this.isRestartingAdb = false;
      if (success) {
        console.log('[Health Monitor] ADB restarted successfully. Resetting restart attempts.');
        this.adbRestartAttempts = 0;
        this.adbRestartBackoffMs = 5000;
      } else {
        this.adbRestartAttempts++;
        this.adbRestartBackoffMs = Math.min(this.adbRestartBackoffMs * 2, this.MAX_ADB_RESTART_BACKOFF_MS);
        console.warn(`[Health Monitor] ADB restart failed. Backoff increased to ${this.adbRestartBackoffMs}ms`);
      }
    }, delay);
  }
  
  /**
   * Check how many devices are connected
   * @returns {Promise<number>}
   */
   checkDeviceConnectivity() {
     return new Promise((resolve) => {
       try {
         const dm = this.manager?.dm;
         if (dm && typeof dm.online_devices === 'object') {
           resolve(Object.keys(dm.online_devices).length);
           return;
         }
       } catch (error) {
         console.warn('[Health Monitor] Could not get device count from DeviceManager:', error);
       }
       if (this.adbManager && typeof this.adbManager.getDevices === 'function') {
         this.adbManager.getDevices()
           .then(result => resolve(result && result.devices ? result.devices.length : 0))
           .catch(() => resolve(0));
       } else {
         resolve(0);
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
          this.licenseManager.checkLicense().then(valid => resolve(valid?.isValid ?? false)).catch(() => resolve(false));
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