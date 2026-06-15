// =====================================================
// PHONE FARM V2 - TAILSCALE MANAGER
// Unified Application
// =====================================================

const { exec, spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { shell } = require('electron');
const { validateExecArg } = require('./device-id-validator');
const crypto = require('crypto');

class TailscaleManager {
  constructor() {
    this.tailscalePath = 'C:\\Program Files\\Tailscale\\tailscale.exe';
    this.installerUrl = 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe';
    this.adminUrl = 'https://login.tailscale.com/admin/machines';
  }

  /**
   * Check if Tailscale is installed
   */
  isInstalled() {
    return fs.existsSync(this.tailscalePath);
  }

  /**
   * Check if Tailscale service is running
   */
  async isRunning() {
    return new Promise((resolve) => {
      exec('sc query Tailscale', { windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(stdout.includes('RUNNING'));
      });
    });
  }

  /**
   * Get Tailscale status
   */
  async getStatus() {
    if (!this.isInstalled()) {
      return {
        installed: false,
        running: false,
        loggedIn: false,
        ip: null,
        hostname: null
      };
    }

    const running = await this.isRunning();
    if (!running) {
      return {
        installed: true,
        running: false,
        loggedIn: false,
        ip: null,
        hostname: null
      };
    }

    try {
      const status = await this.getStatusJson();
      return {
        installed: true,
        running: true,
        loggedIn: status.loggedIn,
        ip: status.ip,
        hostname: status.hostname,
        backendState: status.backendState
      };
    } catch (e) {
      console.error('[Tailscale] Status error:', e.message);
      return {
        installed: true,
        running: true,
        loggedIn: false,
        ip: null,
        hostname: null
      };
    }
  }

  /**
   * Get detailed status as JSON
   */
  async getStatusJson() {
    return new Promise((resolve, reject) => {
      exec(`"${this.tailscalePath}" status --json`, {
        windowsHide: true,
        timeout: 10000
      }, (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const status = JSON.parse(stdout);
          const self = status.Self;

          resolve({
            backendState: status.BackendState,
            loggedIn: status.BackendState === 'Running' && self?.Online === true,
            ip: self?.TailscaleIPs?.[0] || null,
            hostname: self?.HostName || null,
            online: self?.Online || false,
            peers: Object.keys(status.Peer || {}).length
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Start Tailscale service
   */
  async startService() {
    return new Promise((resolve) => {
      exec('net start Tailscale', { windowsHide: true }, (err) => {
        if (!err) {
          resolve({ success: true });
          return;
        }
        if (err.code === 1056 || err.message.includes('already been started') || err.message.includes('already running')) {
          resolve({ success: true });
          return;
        }
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Login to Tailscale (opens browser)
   */
  async login() {
    return new Promise((resolve) => {
      const proc = spawn(this.tailscalePath, ['up'], {
        windowsHide: true
      });

      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
        if (process.env?.DEBUG) console.log('[Tailscale] Login output:', data.toString());
      });

      proc.stderr.on('data', (data) => {
        output += data.toString();
        if (process.env?.DEBUG) console.log('[Tailscale] Login stderr:', data.toString());
      });

      proc.on('close', (code) => {
        resolve({ success: code === 0, output });
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      // The login process waits for user to complete in browser
      // Don't timeout, let it run
    });
  }

  /**
   * Logout from Tailscale
   */
  async logout() {
    return new Promise((resolve) => {
      exec(`"${this.tailscalePath}" logout`, { windowsHide: true }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Open Tailscale admin console in browser
   */
  async openAdmin() {
    try {
      await shell.openExternal(this.adminUrl);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get list of peers (other machines in network)
   */
  async getPeers() {
    try {
      const status = await this.getStatusJson();
      return { success: true, peers: status.peers };
    } catch (e) {
      return { success: false, error: e.message, peers: [] };
    }
  }

  /**
   * Download Tailscale installer
   */
  async downloadInstaller(progressCallback) {
    const downloadPath = path.join(os.tmpdir(), 'tailscale-' + crypto.randomUUID() + '.exe');

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);

      const MAX_REDIRECTS = 5;
      const makeRequest = (url, depth = 0) => {
        if (depth >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
          return;
        }
        https.get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Follow redirect
            const location = response.headers.location;
            makeRequest(location, depth + 1);
            return;
          }

          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloadedSize = 0;

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (progressCallback && totalSize) {
              progressCallback(Math.round((downloadedSize / totalSize) * 100));
            }
          });

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(downloadPath);
          });
        }).on('error', (err) => {
          fs.unlink(downloadPath, () => {});
          reject(err);
        });
      };

      makeRequest(this.installerUrl);
    });
  }

  /**
   * Install Tailscale
   */
  async install(progressCallback) {
    try {
      if (progressCallback) progressCallback(0);

      // Download installer
      const installerPath = await this.downloadInstaller((progress) => {
        if (progressCallback) progressCallback(Math.round(progress * 0.5)); // 0-50%
      });

      if (progressCallback) progressCallback(50);

      // Run installer (silent install)
      return new Promise((resolve) => {
        const proc = spawn(installerPath, ['/S'], {
          windowsHide: true
        });

        proc.on('close', (code) => {
          // Clean up installer
          fs.unlink(installerPath, () => {});

          if (progressCallback) progressCallback(100);

          // Check if installed successfully
          setTimeout(() => {
            const installed = this.isInstalled();
            resolve({ success: installed, code });
          }, 3000);
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Ping a peer — SECURE: uses execFile with argument array,
   * pre-validates the IP address to prevent command injection.
   */
  async ping(ip) {
    return new Promise((resolve) => {
      // Pre-validate the IP to block injection payloads
      const validatedIp = validateExecArg(ip, 'IP address');
      // execFile passes args as literal array — no shell interpretation
      execFile(this.tailscalePath, ['ping', '--c', '1', validatedIp], {
        windowsHide: true,
        timeout: 10000
      }, (err, stdout) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          const match = stdout.match(/(\d+)ms/);
          resolve({
            success: true,
            latency: match ? parseInt(match[1], 10) : null,
            output: stdout.trim()
          });
        }
      });
    });
  }
}

module.exports = TailscaleManager;
