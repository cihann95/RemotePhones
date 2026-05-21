/**
 * Spawn a child process with a configurable timeout.
 * If the process event loop or spawn call does not resolve within the
 * given timeout the child is killed and the promise rejects.
 *
 * @param {string}   command   - Executable path
 * @param {string[]} args      - Argument list
 * @param {object}   options   - child_process.spawn options
 * @param {number}   [timeout=SCRCPY_SPAWN_TIMEOUT_MS] - Timeout in milliseconds (default 30 s)
 * @returns {Promise<ChildProcess>}
 */
function spawnPromise(command, args, options, timeout = SCRCPY_SPAWN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch (_) {
        /* child already exited */
      }
      reject(new Error('scrcpy spawn timed out'));
    }, timeout);

    child.on('spawn', () => {
      clearTimeout(timer);
      resolve(child);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(err);
      }
    });

    child.on('exit', () => {
      clearTimeout(timer);
    });
  });
}

// =====================================================
// PHONE FARM V2 - SCRCPY MANAGER
// Unified Application
// =====================================================

const { spawn, execFile } = require('child_process');
const BaseToolManager = require('./base-tool-manager');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Store = require('electron-store');
const { SCRCPY_SPAWN_TIMEOUT_MS } = require('./constants');
const { STOP_DEVICE_TIMEOUT_MS: _STOP_TIMEOUT } = require('./constants');

class ScrcpyManager extends BaseToolManager {
  constructor() {
    super({ logPrefix: '[Scrcpy]', subPath: 'scrcpy/scrcpy.exe' });
    this.scrcpyPath = null;
    this.activeProcesses = new Map(); // deviceId -> process
    this.options = new Store({
      name: 'scrcpy-options',
      defaults: {
        maxSize: 800,
        maxFps: 30,
        bitrate: '2M',
        borderless: false,
        alwaysOnTop: false,
        showTouches: false,
        stayAwake: true,
        turnScreenOff: false,
        noAudio: true
      }
    });
  }

  /**
   * Find scrcpy executable
   */
  findTool() {
    if (this.scrcpyPath && fs.existsSync(this.scrcpyPath)) return this.scrcpyPath;
    const toolsPath = super.findToolsPath();
    if (toolsPath) {
      this.scrcpyPath = path.join(toolsPath, 'scrcpy', 'scrcpy.exe');
      if (fs.existsSync(this.scrcpyPath)) return this.scrcpyPath;
    }
    console.error('[Scrcpy] scrcpy.exe not found');
    return null;
  }

  /**
   * Validate that the scrcpy binary exists before any spawn operation.
   * @returns {{success: boolean, error?: string}}
   */
  checkScrcpyExists() {
    if (this.findTool()) {
      return { success: true };
    }
    return { success: false, error: 'scrcpy binary not found' };
  }

  /**
   * Get current options
   */
  getOptions() {
    return this.options.store;
  }

  /**
   * Set options
   */
  setOptions(newOptions) {
    for (const [key, value] of Object.entries(newOptions)) {
      this.options.set(key, value);
    }
    return this.options.store;
  }

  /**
   * Build command line arguments from options
   */
  buildArgs(deviceId, customOptions = {}) {
    const opts = { ...this.options.store, ...customOptions };
    const args = ['-s', deviceId, '--keyboard=uhid'];

    if (opts.maxSize) {
      args.push('--max-size', opts.maxSize.toString());
    }

    if (opts.maxFps) {
      args.push('--max-fps', opts.maxFps.toString());
    }

    if (opts.bitrate) {
      args.push('--video-bit-rate', opts.bitrate);
    }

    if (opts.borderless) {
      args.push('--window-borderless');
    }

    if (opts.alwaysOnTop) {
      args.push('--always-on-top');
    }

    if (opts.showTouches) {
      args.push('--show-touches');
    }

    if (opts.stayAwake) {
      args.push('--stay-awake');
    }

    if (opts.turnScreenOff) {
      args.push('--turn-screen-off');
    }

    if (opts.noAudio) {
      args.push('--no-audio');
    }

    // Window title
    args.push('--window-title', `Phone Farm - ${deviceId}`);

    return args;
  }

  /**
   * Start scrcpy for a device
   */
  async startDevice(deviceId, customOptions = {}) {
    const existsCheck = this.checkScrcpyExists();
    if (!existsCheck.success) {
      return existsCheck;
    }
    const scrcpy = this.findTool();

    // Check if already running
    if (this.activeProcesses.has(deviceId)) {
      if (process.env?.DEBUG) console.log(`[Scrcpy] Already running for device: ${deviceId}`);
      return { success: true, alreadyRunning: true };
    }

    const args = this.buildArgs(deviceId, customOptions);
    if (process.env?.DEBUG) console.log(`[Scrcpy] Starting for ${deviceId} with args:`, args);

    try {
      const proc = await spawnPromise(scrcpy, args, {
        cwd: path.dirname(scrcpy),
        windowsHide: false,
        detached: false
      });

      let startupError = '';

      proc.stderr.on('data', (data) => {
        const msg = data.toString();
        if (process.env?.DEBUG) console.log(`[Scrcpy ${deviceId}] stderr:`, msg);
        startupError += msg;
      });

      proc.stdout.on('data', (data) => {
        if (process.env?.DEBUG) console.log(`[Scrcpy ${deviceId}] stdout:`, data.toString());
      });

      proc.on('close', (code) => {
        if (process.env?.DEBUG) console.log(`[Scrcpy] Process closed for ${deviceId} with code ${code}`);
        this.activeProcesses.delete(deviceId);
        if (global.mainWindow) {
          global.mainWindow.webContents.send('scrcpy-window-closed', { deviceId, code });
        }
      });

      this.activeProcesses.set(deviceId, proc);
      if (process.env?.DEBUG) console.log(`[Scrcpy] Process spawned for ${deviceId}`);
      return { success: true, deviceId, pid: proc.pid };

    } catch (err) {
      console.error(`[Scrcpy] Failed to start for ${deviceId}:`, err.message);
      return { success: false, error: err.message, deviceId };
    }
  }

  /**
   * Stop scrcpy for a device
   */
  async stopDevice(deviceId) {
    const proc = this.activeProcesses.get(deviceId);
    if (!proc) {
      return { success: true, alreadyStopped: true };
    }

    return new Promise((resolve) => {
      proc.on('close', () => {
        this.activeProcesses.delete(deviceId);
        resolve({ success: true, deviceId });
      });

      try {
        proc.kill('SIGTERM');
        // Force kill after timeout
        setTimeout(() => {
          if (this.activeProcesses.has(deviceId)) {
            proc.kill('SIGKILL');
          }
        }, _STOP_TIMEOUT);
      } catch (e) {
        console.error(`[Scrcpy] Error killing process for ${deviceId}:`, e);
        this.activeProcesses.delete(deviceId);
        resolve({ success: false, error: e.message });
      }
    });
  }

  /**
   * Start scrcpy for all devices
   */
  async startAll(deviceIds) {
    const results = [];
    for (const deviceId of deviceIds) {
      const result = await this.startDevice(deviceId);
      results.push(result);
      // Small delay between starts
      await new Promise(r => setTimeout(r, 500));
    }
    return { success: true, results };
  }

  /**
   * Stop all scrcpy processes
   */
  async stopAll() {
    const deviceIds = Array.from(this.activeProcesses.keys());
    const results = [];
    for (const deviceId of deviceIds) {
      const result = await this.stopDevice(deviceId);
      results.push(result);
    }
    return { success: true, results };
  }

  /**
   * Get list of active devices
   */
  getActiveDevices() {
    return Array.from(this.activeProcesses.keys());
  }

  /**
   * Check if device is active
   */
  isDeviceActive(deviceId) {
    return this.activeProcesses.has(deviceId);
  }

  /**
   * Get scrcpy status
   */
  async getStatus() {
    const result = await super.getStatus();
    return {
      ...result,
      activeDevices: this.getActiveDevices(),
      activeCount: this.activeProcesses.size
    };
  }
}

module.exports = ScrcpyManager;
