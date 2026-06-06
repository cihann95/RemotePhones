// =====================================================
// PHONE FARM V2 - ADB MANAGER
// Unified Application
// =====================================================

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseToolManager = require('./base-tool-manager');
const { validateDeviceId, validateExecArg } = require('./device-id-validator');

const DEBUG = process.env.NODE_ENV === 'development';

class ADBManager extends BaseToolManager {
  constructor() {
    super({ logPrefix: '[ADB]', subPath: 'adb/adb.exe' });
    this.serverStarted = false;
  }

  /**
   * Find ADB executable
   */
  findTool() {
    if (this.adbPath && fs.existsSync(this.adbPath)) {
      return this.adbPath;
    }

    const toolsPath = this.findToolsPath();
    if (toolsPath) {
      this.adbPath = path.join(toolsPath, 'adb', 'adb.exe');
        if (fs.existsSync(this.adbPath)) {
          if (DEBUG) console.log('[ADB] Found at:', this.adbPath);
        return this.adbPath;
      }
    }

    console.error('[ADB] adb.exe not found');
    return null;
  }

  /**
   * Execute ADB command
   */
  runCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const adb = this.findTool();
      if (!adb) {
        return reject(new Error('ADB not found'));
      }

      const timeout = options.timeout || 30000;
      const child = execFile(adb, args, {
        timeout,
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true
      }, (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            return resolve({ stdout: stdout || '', stderr: stderr || '', timedOut: true });
          }
          return reject(error);
        }
        resolve({ stdout, stderr });
      });
    });
  }

  /**
   * Start ADB server
   */
  async startServer() {
    if (this.serverStarted) {
      return { success: true };
    }

    try {
      await this.runCommand(['start-server'], { timeout: 10000 });
      this.serverStarted = true;
      if (DEBUG) console.log('[ADB] Server started');
      return { success: true };
    } catch (e) {
      console.error('[ADB] Failed to start server:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Stop ADB server
   */
  async stopServer() {
    try {
      await this.runCommand(['kill-server'], { timeout: 10000 });
      this.serverStarted = false;
      if (DEBUG) console.log('[ADB] Server stopped');
      return { success: true };
    } catch (e) {
      console.error('[ADB] Failed to stop server:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Get list of connected devices
   */
  async getDevices() {
    if (DEBUG) console.log('[ADB] ========== GET DEVICES ==========');
    if (DEBUG) console.log('[ADB] ADB path:', this.adbPath);

    try {
      if (DEBUG) console.log('[ADB] Running: adb devices -l');
      const { stdout, stderr } = await this.runCommand(['devices', '-l'], { timeout: 10000 });

      if (DEBUG) console.log('[ADB] Raw stdout:', JSON.stringify(stdout));
      if (stderr) if (DEBUG) console.log('[ADB] stderr:', stderr);

      const devices = [];
      const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (DEBUG) console.log('[ADB] Lines count:', lines.length);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (DEBUG) console.log(`[ADB] Line ${i}: "${line}"`);

        if (line.startsWith('List of devices')) {
          if (DEBUG) console.log('[ADB] Skipping header line');
          continue;
        }

        const match = line.match(/^(\S+)\s+device\s+(.*)$/);
        if (match) {
          const id = match[1];
          const info = match[2];
          if (DEBUG) console.log(`[ADB] MATCH FOUND - ID: ${id}, Info: ${info}`);

          const modelMatch = info.match(/model:(\S+)/);
          const productMatch = info.match(/product:(\S+)/);
          const deviceMatch = info.match(/device:(\S+)/);

          const device = {
            id,
            model: modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Unknown',
            product: productMatch ? productMatch[1] : '',
            device: deviceMatch ? deviceMatch[1] : '',
            status: 'device'
          };
          if (DEBUG) console.log('[ADB] Parsed device:', device);
          devices.push(device);
        }
      }

      if (DEBUG) console.log('[ADB] Total devices found:', devices.length);
      if (DEBUG) console.log('[ADB] ======================================');
      return { success: true, devices };
    } catch (e) {
      console.error('[ADB] ========== GET DEVICES ERROR ==========');
      console.error('[ADB] Error name:', e.name);
      console.error('[ADB] Error message:', e.message);
      console.error('[ADB] Error stack:', e.stack);
      if (DEBUG) console.log('[ADB] ==========================================');
      return { success: false, error: e.message, devices: [] };
    }
  }

  /**
   * Get device property
   */
  async getDeviceProp(deviceId, prop) {
    try {
      const validatedId = validateDeviceId(deviceId);
      validateExecArg(prop);
      const { stdout } = await this.runCommand(['-s', validatedId, 'shell', 'getprop', prop], { timeout: 5000 });
      return stdout.trim();
    } catch (e) {
      console.error('[ADB] getDeviceProp failed:', e?.message || e);
      return null;
    }
  }

  /**
   * Get battery level for a device
   */
  async getBatteryLevel(deviceId) {
    try {
      const validatedId = validateDeviceId(deviceId);
      const { stdout } = await this.runCommand(['-s', validatedId, 'shell', 'dumpsys', 'battery'], { timeout: 5000 });
      const match = stdout.match(/level:\s*(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    } catch (e) {
      console.error('[ADB] getBatteryLevel failed:', e?.message || e);
      return null;
    }
  }

  /**
   * Get screen size for a device
   */
  async getScreenSize(deviceId) {
    try {
      const validatedId = validateDeviceId(deviceId);
      const { stdout } = await this.runCommand(['-s', validatedId, 'shell', 'wm', 'size'], { timeout: 5000 });
      const match = stdout.match(/Physical size:\s*(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
      return null;
    } catch (e) {
      console.error('[ADB] getScreenSize failed:', e?.message || e);
      return null;
    }
  }

  /**
   * Get full device info
   */
  async getDeviceInfo(deviceId) {
    let battery, screenSize, manufacturer, androidVersion;
    try {
      const validatedId = validateDeviceId(deviceId);
      [battery, screenSize, manufacturer, androidVersion] = await Promise.all([
        this.getBatteryLevel(validatedId),
        this.getScreenSize(validatedId),
        this.getDeviceProp(validatedId, 'ro.product.manufacturer'),
        this.getDeviceProp(validatedId, 'ro.build.version.release')
      ]);
    } catch (e) {
      console.error('[ADB] getDeviceInfo failed for', deviceId, ':', e.message);
    }

    return {
      battery,
      screenSize,
      manufacturer,
      androidVersion
    };
  }

  /**
   * Get enriched device list with all info — Promise.all parallel enrichment
   */
  async getEnrichedDevices() {
    const result = await this.getDevices();
    if (!result.success) return result;

    const infoPromises = result.devices.map((device) =>
      this.getDeviceInfo(device.id)
        .then(info => ({
          ...device,
          ...info,
          ...(info.device ? {} : {})     // preserve null-safe fallthrough
        }))
    );

    const enrichedDevices = await Promise.all(infoPromises);
    return { success: true, devices: enrichedDevices };
  }

  /**
   * Connect to device over network
   */
   async connect(ip, port = 5555) {
     try {
       const ipStr = ip.toString();
        const validatedPort = validateExecArg(port?.toString(), 'port');
        // Basic IP validation — reject anything with special chars
       if (!/^[a-zA-Z0-9.\-:]+$/.test(ipStr)) {
         throw new Error('Invalid IP address');
       }
       const target = `${ipStr}:${validatedPort}`;
       const { stdout } = await this.runCommand(['connect', target], { timeout: 10000 });
       const success = stdout.includes('connected') || stdout.includes('already');
       return { success, message: stdout.trim() };
     } catch (e) {
       console.error('[ADB] connect failed:', e?.message || e);
       return { success: false, error: e.message };
     }
   }

  /**
   * Disconnect from network device
   */
  async disconnect(ip, port = 5555) {
    try {
      const ipStr = (ip || '').toString().trim();
      if (!ipStr) {
        return { success: false, error: 'IP address is required' };
      }
      // Basic IP validation — reject anything with special chars
      if (!/^[a-zA-Z0-9.\-:]+$/.test(ipStr)) {
        throw new Error('Invalid IP address');
      }
      // If the IP already contains a port (e.g. 192.168.1.42:5555), use it as-is
      const target = ipStr.includes(':') ? ipStr : `${ipStr}:${port}`;
      const { stdout } = await this.runCommand(['disconnect', target], { timeout: 10000 });
      return { success: true, message: stdout.trim() };
    } catch (e) {
      console.error('[ADB] disconnect failed:', e?.message || e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Send text to device via ADB input
   */
  async sendText(deviceId, text) {
    try {
      const validatedId = validateDeviceId(deviceId);
      validateExecArg(text);
      const escapedText = text.replace(/ /g, '%s').replace(/&/g, '\\&').replace(/</g, '\\<').replace(/>/g, '\\>').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const { stdout, stderr } = await this.runCommand(['-s', validatedId, 'shell', 'input', 'text', escapedText], { timeout: 10000 });
      if (DEBUG) console.log('[ADB] sendText result:', stdout);
      return { success: true, stdout: stdout.trim() };
    } catch (e) {
      console.error('[ADB] sendText error:', e?.message || e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Send key event to device via ADB input
   */
  async sendKey(deviceId, keycode) {
    try {
      const validatedId = validateDeviceId(deviceId);
      const validatedKeycode = validateExecArg(keycode.toString(), 'Keycode');
      const { stdout, stderr } = await this.runCommand(['-s', validatedId, 'shell', 'input', 'keyevent', validatedKeycode], { timeout: 10000 });
      if (DEBUG) console.log('[ADB] sendKey result:', stdout);
      return { success: true, stdout: stdout.trim() };
    } catch (e) {
      console.error('[ADB] sendKey error:', e?.message || e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Check ADB server status
   */
  async _checkRunning() {
    try {
      const { stdout } = await this.runCommand(['get-state'], { timeout: 5000 });
      return stdout.trim() === 'device';
    } catch {
      return false;
    }
  }

  async getStatus() {
    const result = await super.getStatus();
    return result;
  }
}

module.exports = ADBManager;
