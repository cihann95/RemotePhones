// =====================================================
// PHONE FARM V2 - PARSEC MANAGER
// Unified Application
// =====================================================

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

class ParsecManager {
  constructor() {
    this.parsecPaths = [
      'C:\\Program Files\\Parsec\\parsecd.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Parsec', 'parsecd.exe')
    ];
    this.installerUrl = 'https://builds.parsec.app/package/parsec-windows.exe';
  }

  /**
   * Find Parsec executable
   */
  findParsec() {
    for (const p of this.parsecPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Check if Parsec is installed
   */
  isInstalled() {
    return !!this.findParsec();
  }

  /**
   * Check if Parsec process is running
   */
  async isRunning() {
    return new Promise((resolve) => {
      exec('tasklist /FI "IMAGENAME eq parsecd.exe"', { windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(stdout.toLowerCase().includes('parsecd.exe'));
      });
    });
  }

  /**
   * Check if user is logged in to Parsec
   * This checks for the user.bin file which exists when logged in
   */
  isLoggedIn() {
    const userBinPaths = [
      path.join(os.homedir(), 'AppData', 'Roaming', 'Parsec', 'user.bin'),
      path.join(os.homedir(), 'AppData', 'Local', 'Parsec', 'user.bin')
    ];

    for (const p of userBinPaths) {
      if (fs.existsSync(p)) {
        try {
          const stats = fs.statSync(p);
          // File should be at least 100 bytes if logged in
          if (stats.size > 100) {
            if (process.env?.DEBUG) console.log('[Parsec] User logged in (user.bin found at:', p, 'size:', stats.size, ')');
            return true;
          }
        } catch (e) {
          console.error('[Parsec] Error checking user.bin:', e.message);
        }
      }
    }

    if (process.env?.DEBUG) console.log('[Parsec] User not logged in (user.bin not found or empty)');
    return false;
  }

  /**
   * Get full Parsec status
   */
  async getStatus() {
    const installed = this.isInstalled();
    const running = installed ? await this.isRunning() : false;
    const loggedIn = installed ? this.isLoggedIn() : false;

    return {
      installed,
      running,
      loggedIn,
      path: this.findParsec()
    };
  }

  /**
   * Start Parsec
   */
  async start() {
    const parsec = this.findParsec();
    if (!parsec) {
      return { success: false, error: 'Parsec not installed' };
    }

    // Check if already running
    if (await this.isRunning()) {
      return { success: true, alreadyRunning: true };
    }

    return new Promise((resolve) => {
      const proc = spawn(parsec, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });

      proc.unref();

      // Give it time to start
      setTimeout(async () => {
        const running = await this.isRunning();
        resolve({ success: running });
      }, 2000);
    });
  }

  /**
   * Open Parsec (bring to foreground)
   */
  async open() {
    const parsec = this.findParsec();
    if (!parsec) {
      return { success: false, error: 'Parsec not installed' };
    }

    return new Promise((resolve) => {
      // Opening Parsec again will bring it to foreground
      exec(`"${parsec}"`, { windowsHide: false }, (err) => {
        if (err && !err.message.includes('already running')) {
          console.error('[Parsec] Open error:', err.message);
        }
        resolve({ success: true });
      });
    });
  }

  /**
   * Stop Parsec
   */
  async stop() {
    return new Promise((resolve) => {
      exec('taskkill /F /IM parsecd.exe', { windowsHide: true }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Download Parsec installer
   */
  async downloadInstaller(progressCallback) {
    const downloadPath = path.join(os.tmpdir(), 'parsec-installer.exe');

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);

      https.get(this.installerUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          https.get(response.headers.location, (redirectResponse) => {
            const totalSize = parseInt(redirectResponse.headers['content-length'], 10);
            let downloadedSize = 0;

            redirectResponse.on('data', (chunk) => {
              downloadedSize += chunk.length;
              if (progressCallback) {
                progressCallback(Math.round((downloadedSize / totalSize) * 100));
              }
            });

            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve(downloadPath);
            });
          }).on('error', reject);
        } else {
          const totalSize = parseInt(response.headers['content-length'], 10);
          let downloadedSize = 0;

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (progressCallback) {
              progressCallback(Math.round((downloadedSize / totalSize) * 100));
            }
          });

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(downloadPath);
          });
        }
      }).on('error', (err) => {
        fs.unlink(downloadPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Install Parsec
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
          }, 2000);
        });

        proc.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = ParsecManager;
