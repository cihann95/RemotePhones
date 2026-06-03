// =====================================================
// PHONE FARM V2 - PATH HELPER
// Unified paths for development and production
// =====================================================

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Check if running in packaged (production) mode
 */
function isDev() {
  return !app.isPackaged;
}

/**
 * Get the tools directory path
 * Development: phone-farm-release/tools
 * Production: resources/tools
 */
function getToolsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools');
  }

  // Development - try multiple paths
  const possiblePaths = [
    process.env.PHONE_FARM_TOOLS,
    path.join(process.cwd(), '..', 'tools'),
    path.join(process.cwd(), 'tools'),
    path.join(__dirname, '..', '..', '..', 'tools'),
    path.join(__dirname, '..', '..', 'tools'),
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  console.error('[Paths] Tools directory not found');
  return null;
}

/**
 * Get ADB executable path
 */
function getAdbPath() {
  const toolsPath = getToolsPath();
  if (!toolsPath) return null;
  return path.join(toolsPath, 'adb', 'adb.exe');
}

/**
 * Get Scrcpy executable path
 */
function getScrcpyPath() {
  const toolsPath = getToolsPath();
  if (!toolsPath) return null;
  return path.join(toolsPath, 'scrcpy', 'scrcpy.exe');
}

/**
 * Get Product.dat path for Cryptlex
 * Development: src/main/Product.dat
 * Production: resources/Product.dat
 */
function getProductDataPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Product.dat');
  }
  return path.join(__dirname, 'Product.dat');
}

/**
 * Get app data directory for user data
 */
function getAppDataPath() {
  return app.getPath('userData');
}

/**
 * Log all paths for debugging
 */
function logPaths() {
  if (DEBUG) console.log('[Paths] ========== PATH INFO ==========');
  if (DEBUG) console.log('[Paths] isDev:', isDev());
  if (DEBUG) console.log('[Paths] app.isPackaged:', app.isPackaged);
  if (DEBUG) console.log('[Paths] __dirname:', __dirname);
  if (DEBUG) console.log('[Paths] process.cwd():', process.cwd());
  if (DEBUG) console.log('[Paths] process.resourcesPath:', process.resourcesPath);
  if (DEBUG) console.log('[Paths] Tools path:', getToolsPath());
  if (DEBUG) console.log('[Paths] ADB path:', getAdbPath());
  if (DEBUG) console.log('[Paths] Scrcpy path:', getScrcpyPath());
  if (DEBUG) console.log('[Paths] Product.dat path:', getProductDataPath());
  if (DEBUG) console.log('[Paths] App data path:', getAppDataPath());
  if (DEBUG) console.log('[Paths] ================================');
}

module.exports = {
  isDev,
  getToolsPath,
  getAdbPath,
  getScrcpyPath,
  getProductDataPath,
  getAppDataPath,
  logPaths
};
