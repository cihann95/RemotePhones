// =====================================================
// PHONE FARM V2 - BASE TOOL MANAGER
// Shared path discovery, status, and lifecycle helpers
// for all tool binaries (adb, scrcpy, tailscale, parsec)
// =====================================================

const path = require('path');
const fs = require('fs');
const { exec, execFile, spawn } = require('child_process');
const { app } = require('electron');

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * BaseToolManager
 *
 * Each tool manager subclass only needs to provide:
 *   - logPrefix   - e.g. '[ADB]', '[Scrcpy]'
 *   - subPath     - relative path inside the tools directory, e.g. 'adb/adb.exe'
 *   - _checkRunning() override  - return true/false for process-level check
 *   - _getExtraStatus() override - return tool-specific status fields
 *
 * All path discovery, installation check, and status orchestration
 * is handled here, eliminating duplicated ~45-line blocks per file.
 */
class BaseToolManager {
  constructor(options = {}) {
    this.logPrefix = options.logPrefix || '[Tool]';
    this.subPath   = options.subPath   || '';
    this._toolPath = null;
  }

  /**
   * Find the root of the external ../tools/ directory.
   * Checks production path FIRST, then CWD relatives, then env var.
   */
  findToolsPath() {
    if (DEBUG) console.log(this.logPrefix + ' ========== FIND TOOLS PATH ==========');
    if (DEBUG) console.log(this.logPrefix + ' app.isPackaged:', app.isPackaged);
    if (DEBUG) console.log(this.logPrefix + ' process.resourcesPath:', process.resourcesPath);
    if (DEBUG) console.log(this.logPrefix + ' __dirname:', __dirname);
    if (DEBUG) console.log(this.logPrefix + ' process.cwd():', process.cwd());
    if (DEBUG) console.log(this.logPrefix + ' PHONE_FARM_TOOLS env:', process.env.PHONE_FARM_TOOLS);

    const isProd = app.isPackaged;
    let possiblePaths = [];

    if (isProd) {
      possiblePaths = [
        path.join(process.resourcesPath, 'tools'),
        process.env.PHONE_FARM_TOOLS,
      ].filter(Boolean);
    } else {
      possiblePaths = [
        process.env.PHONE_FARM_TOOLS,
        path.join(process.cwd(), '..', 'tools'),
        path.join(process.cwd(), 'tools'),
        path.join(__dirname, '..', '..', '..', 'tools'),
        path.join(__dirname, '..', '..', 'tools'),
      ].filter(Boolean);
    }

    if (DEBUG) console.log(this.logPrefix + ' Checking paths:', possiblePaths);

    for (const p of possiblePaths) {
      const checkPath = path.join(p, this.subPath);
      const exists = fs.existsSync(checkPath);
      if (DEBUG) console.log(this.logPrefix + ' Checking: ' + checkPath + ' => ' + (exists ? 'EXISTS' : 'NOT FOUND'));
      if (exists) {
        if (DEBUG) console.log(this.logPrefix + ' Found tools at:', p);
        if (DEBUG) console.log(this.logPrefix + ' ==========================================');
        return p;
      }
    }

    console.error(this.logPrefix + ' ERROR: Tools not found in any path!');
    if (DEBUG) console.log(this.logPrefix + ' ==========================================');
    return null;
  }

  /**
   * Abstract: subclasses implement their own binary finder.
   */
  findTool() {
    throw new Error(this.logPrefix + ' findTool() must be implemented by subclass');
  }

  getToolPath() {
    if (this._toolPath && fs.existsSync(this._toolPath)) {
      return this._toolPath;
    }
    this._toolPath = this.findTool();
    return this._toolPath;
  }

  isInstalled() {
    return !!this.getToolPath();
  }

  async _checkRunning() {
    return false;
  }

  _getExtraStatus() {
    return {};
  }

  async _getExtraStatusWhenRunning() {
    return this._getExtraStatus();
  }

  async getStatus() {
    const toolPath = this.getToolPath();
    const installed = !!toolPath;

    if (!installed) {
      return { installed: false, running: false, path: null, ...this._getExtraStatus() };
    }

    const running = await this._checkRunning();
    if (!running) {
      return { installed: true, running: false, path: toolPath, ...this._getExtraStatus() };
    }

    return {
      installed: true,
      running: true,
      path: toolPath,
      ...(await this._getExtraStatusWhenRunning())
    };
  }
}

module.exports = BaseToolManager;
