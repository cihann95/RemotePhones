// =====================================================
// PHONE FARM V2 - AUTO INSTALLER
// Orchestrates silent installation of Tailscale and Parsec
// for Office Mode setup wizard
// =====================================================

const TailscaleManager = require('./tailscale');
const ParsecManager = require('./parsec');

class AutoInstaller {
  constructor() {
    this.tailscaleManager = new TailscaleManager();
    this.parsecManager = new ParsecManager();
  }

  /**
   * Check and install missing tools (Tailscale, Parsec) sequentially
   * @param {Function} progressCallback - Called with { tool: 'tailscale'|'parsec', percent: number, status: string }
   * @returns {Promise<{success: boolean, results: {tailscale: object, parsec: object}, logs: string[]}>}
   */
  async checkAndInstallMissing(progressCallback) {
    const logs = [];
    const results = {
      tailscale: { skipped: false, success: false, error: null },
      parsec: { skipped: false, success: false, error: null }
    };

    const log = (msg) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      if (process.env?.DEBUG) console.log('[AutoInstaller]', msg);
    };

    // Check Tailscale
    log('Checking Tailscale installation...');
    const tailscaleInstalled = this.tailscaleManager.isInstalled();
    
    if (tailscaleInstalled) {
      log('Tailscale already installed, skipping');
      results.tailscale.skipped = true;
      results.tailscale.success = true;
      if (progressCallback) progressCallback({ tool: 'tailscale', percent: 100, status: 'skipped' });
    } else {
      log('Tailscale not installed, starting silent install...');
      if (progressCallback) progressCallback({ tool: 'tailscale', percent: 0, status: 'downloading' });
      
      try {
        const result = await this.tailscaleManager.install((percent) => {
          if (progressCallback) progressCallback({ tool: 'tailscale', percent, status: 'installing' });
        });
        
        results.tailscale.success = result.success;
        results.tailscale.error = result.error || null;
        
        if (result.success) {
          log('Tailscale installed successfully');
          if (progressCallback) progressCallback({ tool: 'tailscale', percent: 100, status: 'completed' });
        } else {
          log(`Tailscale install failed: ${result.error}`);
          if (progressCallback) progressCallback({ tool: 'tailscale', percent: 100, status: 'failed' });
        }
      } catch (e) {
        log(`Tailscale install exception: ${e.message}`);
        results.tailscale.success = false;
        results.tailscale.error = e.message;
        if (progressCallback) progressCallback({ tool: 'tailscale', percent: 100, status: 'failed' });
      }
    }

    // Check Parsec
    log('Checking Parsec installation...');
    const parsecInstalled = this.parsecManager.isInstalled();
    
    if (parsecInstalled) {
      log('Parsec already installed, skipping');
      results.parsec.skipped = true;
      results.parsec.success = true;
      if (progressCallback) progressCallback({ tool: 'parsec', percent: 100, status: 'skipped' });
    } else {
      log('Parsec not installed, starting silent install...');
      if (progressCallback) progressCallback({ tool: 'parsec', percent: 0, status: 'downloading' });
      
      try {
        const result = await this.parsecManager.install((percent) => {
          if (progressCallback) progressCallback({ tool: 'parsec', percent, status: 'installing' });
        });
        
        results.parsec.success = result.success;
        results.parsec.error = result.error || null;
        
        if (result.success) {
          log('Parsec installed successfully');
          if (progressCallback) progressCallback({ tool: 'parsec', percent: 100, status: 'completed' });
        } else {
          log(`Parsec install failed: ${result.error}`);
          if (progressCallback) progressCallback({ tool: 'parsec', percent: 100, status: 'failed' });
        }
      } catch (e) {
        log(`Parsec install exception: ${e.message}`);
        results.parsec.success = false;
        results.parsec.error = e.message;
        if (progressCallback) progressCallback({ tool: 'parsec', percent: 100, status: 'failed' });
      }
    }

    // Overall success: both tools either skipped or installed successfully
    const overallSuccess = results.tailscale.success && results.parsec.success;
    
    log(`Auto-install complete. Overall success: ${overallSuccess}`);
    
    return {
      success: overallSuccess,
      results,
      logs
    };
  }
}

module.exports = AutoInstaller;