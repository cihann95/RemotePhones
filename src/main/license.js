// =====================================================
// PHONE FARM V2 - LICENSE MANAGER (Cryptlex)
// =====================================================

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { LICENSE_RETRY_ATTEMPTS, DEFAULT_LICENSE_RETRY_DELAY_MS } = require('./constants');

const DEBUG = process.env.NODE_ENV === 'development';

let LexActivator;
let StatusCodes;

// =====================================================
// RETRY HELPER — wraps an async function with
// exponential backoff retry logic. Used for
// user-initiated actions (activateLicense) only.
// =====================================================
async function retry(fn, attempts = LICENSE_RETRY_ATTEMPTS, delayMs = DEFAULT_LICENSE_RETRY_DELAY_MS) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { if (i === attempts - 1) throw e; }
    await new Promise(r => setTimeout(r, delayMs * (i + 1)));
  }
}

// Product configuration
const PRODUCT_ID = '019b28b6-a4f7-73d1-81cc-3b568591340e';

// License status cache
let licenseStatus = {
  isValid: false,
  licenseKey: null,
  expiryDate: null,
  maxPhones: 5, // Default limit
  remoteAccess: false, // Default: no remote access
  userName: null,
  userEmail: null,
  lastCheck: null,
  error: null
};

// Initialize LexActivator
function initializeLexActivator() {
  try {
    if (DEBUG) console.log('[License] ========== LEXACTIVATOR INIT START ==========');
    if (DEBUG) console.log('[License] app.isPackaged:', app.isPackaged);
    if (DEBUG) console.log('[License] process.resourcesPath:', process.resourcesPath);
    if (DEBUG) console.log('[License] __dirname:', __dirname);
    if (DEBUG) console.log('[License] process.cwd():', process.cwd());

    // Get Product.dat path
    const productFile = getProductFilePath();
    if (DEBUG) console.log('[License] Product.dat path:', productFile);

    // Check if file exists
    const fileExists = fs.existsSync(productFile);
    if (DEBUG) console.log('[License] Product.dat exists:', fileExists);

    if (!fileExists) {
      console.error('[License] ERROR: Product.dat NOT FOUND at:', productFile);
      if (app.isPackaged && process.resourcesPath) {
        try {
          const resourcesContents = fs.readdirSync(process.resourcesPath);
          if (DEBUG) console.log('[License] Contents of resources folder:', resourcesContents);
        } catch (e) {
          if (DEBUG) console.log('[License] Could not list resources folder:', e.message);
        }
      }
      licenseStatus.error = 'Product.dat file not found. Please reinstall the application.';
      if (DEBUG) console.log('[License] ========== LEXACTIVATOR INIT FAILED ==========');
      return false;
    }

    // Try to load LexActivator module
    if (DEBUG) console.log('[License] Loading @cryptlex/lexactivator module...');
    let lexactivator;
    try {
      lexactivator = require('@cryptlex/lexactivator');
      if (DEBUG) console.log('[License] Module loaded successfully');
    } catch (moduleError) {
      console.error('[License] ERROR: @cryptlex/lexactivator module failed to load:', moduleError.message);
      if (app.isPackaged && process.resourcesPath) {
        try {
          const resourcesContents = fs.readdirSync(process.resourcesPath);
          if (DEBUG) console.log('[License] Contents of resources folder:', resourcesContents);
        } catch (e) {
          if (DEBUG) console.log('[License] Could not list resources folder:', e.message);
        }
      }
      licenseStatus.error = 'License module (@cryptlex/lexactivator) not available. Please check installation.';
      if (DEBUG) console.log('[License] ========== LEXACTIVATOR INIT FAILED ==========');
      return false;
    }

    LexActivator = lexactivator.LexActivator;
    StatusCodes = lexactivator.LexStatusCodes;

    // Initialize
    if (DEBUG) console.log('[License] Calling SetProductFile...');
    LexActivator.SetProductFile(productFile);
    if (DEBUG) console.log('[License] SetProductFile completed');

    if (DEBUG) console.log('[License] Calling SetProductId...');
    LexActivator.SetProductId(PRODUCT_ID, lexactivator.PermissionFlags.LA_USER);
    if (DEBUG) console.log('[License] SetProductId completed');

    if (DEBUG) console.log('[License] LexActivator initialized successfully');
    if (DEBUG) console.log('[License] ========== LEXACTIVATOR INIT END ==========');
    return true;
  } catch (error) {
    console.error('[License] ========== LEXACTIVATOR INIT ERROR ==========');
    console.error('[License] Failed to initialize LexActivator');
    console.error('[License] Error name:', error.name);
    console.error('[License] Error message:', error.message);
    console.error('[License] Error stack:', error.stack);
    licenseStatus.error = `LexActivator initialization error: ${error.message}`;
    if (DEBUG) console.log('[License] ========== LEXACTIVATOR INIT FAILED ==========');
    return false;
  }
}

// Get Product.dat file path
function getProductFilePath() {
  // In development, use src/main/Product.dat
  // In production, use resources/Product.dat
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'Product.dat');
  } else {
    return path.join(__dirname, 'Product.dat');
  }
}

// Check if license is valid (called on app startup)
async function checkLicense() {
  if (DEBUG) console.log('[License] Checking license...');

  if (!LexActivator) {
    if (!initializeLexActivator()) {
      // Return the detailed error from licenseStatus
      return { isValid: false, error: licenseStatus.error || 'LexActivator initialization failed' };
    }
  }

  try {
    const status = LexActivator.IsLicenseGenuine();
    if (DEBUG) console.log('[License] IsLicenseGenuine status:', status);

    if (status === StatusCodes.LA_OK || status === StatusCodes.LA_EXPIRED || status === StatusCodes.LA_SUSPENDED || status === StatusCodes.LA_GRACE_PERIOD_OVER) {
      // License is valid (or was valid)
      if (status === StatusCodes.LA_OK) {
        licenseStatus.isValid = true;
        licenseStatus.error = null;
        await loadLicenseInfo();
        if (DEBUG) console.log('[License] License is valid');
      } else if (status === StatusCodes.LA_EXPIRED) {
        licenseStatus.isValid = false;
        licenseStatus.error = 'License has expired';
        if (DEBUG) console.log('[License] License expired');
      } else if (status === StatusCodes.LA_SUSPENDED) {
        licenseStatus.isValid = false;
        licenseStatus.error = 'License has been suspended';
        if (DEBUG) console.log('[License] License suspended');
      } else if (status === StatusCodes.LA_GRACE_PERIOD_OVER) {
        licenseStatus.isValid = false;
        licenseStatus.error = 'License validation time expired';
        if (DEBUG) console.log('[License] Grace period over');
      }
    } else if (status === StatusCodes.LA_FAIL) {
      licenseStatus.isValid = false;
      licenseStatus.error = 'License could not be verified';
      if (DEBUG) console.log('[License] License validation failed');
    } else {
      licenseStatus.isValid = false;
      licenseStatus.error = 'No license found';
      if (DEBUG) console.log('[License] No license found, status:', status);
    }

    licenseStatus.lastCheck = new Date().toISOString();
    return { ...licenseStatus };

  } catch (error) {
    console.error('[License] Check error:', error.message);
    licenseStatus.isValid = false;
    licenseStatus.error = error.message;
    return { isValid: false, error: error.message };
  }
}

// Load license information (metadata, expiry, etc.)
async function loadLicenseInfo() {
  try {
    // Get license key
    try {
      licenseStatus.licenseKey = LexActivator.GetLicenseKey();
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get license key');
    }

    // Get expiry date
    try {
      const expiryTimestamp = LexActivator.GetLicenseExpiryDate();
      if (expiryTimestamp > 0) {
        licenseStatus.expiryDate = new Date(expiryTimestamp * 1000).toISOString();
      }
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get expiry date');
    }

    // Get user info
    try {
      licenseStatus.userName = LexActivator.GetLicenseUserName();
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get user name');
    }

    try {
      licenseStatus.userEmail = LexActivator.GetLicenseUserEmail();
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get user email');
    }

    // Get metadata - maxPhones
    try {
      const maxPhones = LexActivator.GetLicenseMetadata('maxPhones');
      licenseStatus.maxPhones = parseInt(maxPhones, 10) || 5;
      if (DEBUG) console.log('[License] maxPhones:', licenseStatus.maxPhones);
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get maxPhones metadata, using default:', licenseStatus.maxPhones);
    }

    // Get metadata - remoteAccess
    try {
      const remoteAccess = LexActivator.GetLicenseMetadata('remoteAccess');
      licenseStatus.remoteAccess = remoteAccess === 'true' || remoteAccess === '1';
      if (DEBUG) console.log('[License] remoteAccess:', licenseStatus.remoteAccess);
    } catch (e) {
      if (DEBUG) console.log('[License] Could not get remoteAccess metadata, using default:', licenseStatus.remoteAccess);
    }

    if (DEBUG) console.log('[License] License info loaded:', {
      key: licenseStatus.licenseKey ? '***' + licenseStatus.licenseKey.slice(-4) : null,
      expiry: licenseStatus.expiryDate,
      maxPhones: licenseStatus.maxPhones,
      remoteAccess: licenseStatus.remoteAccess
    });

  } catch (error) {
    console.error('[License] Error loading license info:', error.message);
  }
}

// Get status code name for debugging
function getStatusCodeName(code) {
  if (!StatusCodes) return `Unknown(${code})`;

  const codeNames = {
    [StatusCodes.LA_OK]: 'LA_OK',
    [StatusCodes.LA_FAIL]: 'LA_FAIL',
    [StatusCodes.LA_EXPIRED]: 'LA_EXPIRED',
    [StatusCodes.LA_SUSPENDED]: 'LA_SUSPENDED',
    [StatusCodes.LA_GRACE_PERIOD_OVER]: 'LA_GRACE_PERIOD_OVER',
    [StatusCodes.LA_TRIAL_EXPIRED]: 'LA_TRIAL_EXPIRED',
    [StatusCodes.LA_LOCAL_TRIAL_EXPIRED]: 'LA_LOCAL_TRIAL_EXPIRED',
    [StatusCodes.LA_E_FILE_PATH]: 'LA_E_FILE_PATH',
    [StatusCodes.LA_E_PRODUCT_FILE]: 'LA_E_PRODUCT_FILE',
    [StatusCodes.LA_E_PRODUCT_DATA]: 'LA_E_PRODUCT_DATA',
    [StatusCodes.LA_E_PRODUCT_ID]: 'LA_E_PRODUCT_ID',
    [StatusCodes.LA_E_SYSTEM_PERMISSION]: 'LA_E_SYSTEM_PERMISSION',
    [StatusCodes.LA_E_FILE_PERMISSION]: 'LA_E_FILE_PERMISSION',
    [StatusCodes.LA_E_WMIC]: 'LA_E_WMIC',
    [StatusCodes.LA_E_TIME]: 'LA_E_TIME',
    [StatusCodes.LA_E_INET]: 'LA_E_INET',
    [StatusCodes.LA_E_NET_PROXY]: 'LA_E_NET_PROXY',
    [StatusCodes.LA_E_HOST_URL]: 'LA_E_HOST_URL',
    [StatusCodes.LA_E_BUFFER_SIZE]: 'LA_E_BUFFER_SIZE',
    [StatusCodes.LA_E_APP_VERSION_LENGTH]: 'LA_E_APP_VERSION_LENGTH',
    [StatusCodes.LA_E_REVOKED]: 'LA_E_REVOKED',
    [StatusCodes.LA_E_LICENSE_KEY]: 'LA_E_LICENSE_KEY',
    [StatusCodes.LA_E_LICENSE_TYPE]: 'LA_E_LICENSE_TYPE',
    [StatusCodes.LA_E_OFFLINE_RESPONSE_FILE]: 'LA_E_OFFLINE_RESPONSE_FILE',
    [StatusCodes.LA_E_OFFLINE_RESPONSE_FILE_EXPIRED]: 'LA_E_OFFLINE_RESPONSE_FILE_EXPIRED',
    [StatusCodes.LA_E_ACTIVATION_LIMIT]: 'LA_E_ACTIVATION_LIMIT',
    [StatusCodes.LA_E_ACTIVATION_NOT_FOUND]: 'LA_E_ACTIVATION_NOT_FOUND',
    [StatusCodes.LA_E_DEACTIVATION_LIMIT]: 'LA_E_DEACTIVATION_LIMIT',
    [StatusCodes.LA_E_TRIAL_NOT_ALLOWED]: 'LA_E_TRIAL_NOT_ALLOWED',
    [StatusCodes.LA_E_TRIAL_ACTIVATION_LIMIT]: 'LA_E_TRIAL_ACTIVATION_LIMIT',
    [StatusCodes.LA_E_MACHINE_FINGERPRINT]: 'LA_E_MACHINE_FINGERPRINT',
    [StatusCodes.LA_E_METADATA_KEY_LENGTH]: 'LA_E_METADATA_KEY_LENGTH',
    [StatusCodes.LA_E_METADATA_VALUE_LENGTH]: 'LA_E_METADATA_VALUE_LENGTH',
    [StatusCodes.LA_E_ACTIVATION_METADATA_LIMIT]: 'LA_E_ACTIVATION_METADATA_LIMIT',
    [StatusCodes.LA_E_TRIAL_ACTIVATION_METADATA_LIMIT]: 'LA_E_TRIAL_ACTIVATION_METADATA_LIMIT',
    [StatusCodes.LA_E_METADATA_KEY_NOT_FOUND]: 'LA_E_METADATA_KEY_NOT_FOUND',
    [StatusCodes.LA_E_TIME_MODIFIED]: 'LA_E_TIME_MODIFIED',
    [StatusCodes.LA_E_RELEASE_VERSION_FORMAT]: 'LA_E_RELEASE_VERSION_FORMAT',
    [StatusCodes.LA_E_AUTHENTICATION_FAILED]: 'LA_E_AUTHENTICATION_FAILED',
    [StatusCodes.LA_E_METER_ATTRIBUTE_NOT_FOUND]: 'LA_E_METER_ATTRIBUTE_NOT_FOUND',
    [StatusCodes.LA_E_METER_ATTRIBUTE_USES_LIMIT_REACHED]: 'LA_E_METER_ATTRIBUTE_USES_LIMIT_REACHED',
    [StatusCodes.LA_E_VM]: 'LA_E_VM',
    [StatusCodes.LA_E_COUNTRY]: 'LA_E_COUNTRY',
    [StatusCodes.LA_E_IP]: 'LA_E_IP',
    [StatusCodes.LA_E_RATE_LIMIT]: 'LA_E_RATE_LIMIT',
    [StatusCodes.LA_E_SERVER]: 'LA_E_SERVER',
    [StatusCodes.LA_E_CLIENT]: 'LA_E_CLIENT',
  };

  return codeNames[code] || `Unknown(${code})`;
}

// Activate license with a key
async function activateLicense(licenseKey) {
  if (DEBUG) console.log('[License] ========== ACTIVATION START ==========');
  if (DEBUG) console.log('[License] License Key:', licenseKey ? `${licenseKey.substring(0, 8)}...${licenseKey.slice(-4)}` : 'NULL');
  if (DEBUG) console.log('[License] Product ID:', PRODUCT_ID);

  // Preflight validation: reject empty or suspicious values before calling LexActivator
  if (typeof licenseKey !== 'string') {
    return { success: false, error: 'Invalid license key' };
  }
  const trimmedKey = licenseKey.trim();
  if (trimmedKey.length === 0) {
    return { success: false, error: 'License key cannot be empty' };
  }
  if (trimmedKey.length > 128) {
    return { success: false, error: 'License key is too long' };
  }

  if (!LexActivator) {
    if (DEBUG) console.log('[License] LexActivator not initialized, initializing now...');
    if (!initializeLexActivator()) {
      console.error('[License] LexActivator initialization failed');
      return { success: false, error: 'LexActivator initialization failed' };
    }
  }

  try {
    // Set the license key
    if (DEBUG) console.log('[License] Calling SetLicenseKey...');
    LexActivator.SetLicenseKey(trimmedKey);
    if (DEBUG) console.log('[License] SetLicenseKey completed');

    // Activate — wrapped in retry for network resilience
    if (DEBUG) console.log('[License] Calling ActivateLicense...');
    const status = await retry(() => LexActivator.ActivateLicense());
    const statusName = getStatusCodeName(status);
    if (DEBUG) console.log('[License] ActivateLicense returned:', status, `(${statusName})`);

    // Log all known status codes for reference
    if (DEBUG) console.log('[License] Status code reference: LA_OK=0, LA_FAIL=1, LA_E_LICENSE_KEY=40');

    if (status === StatusCodes.LA_OK) {
      licenseStatus.isValid = true;
      licenseStatus.licenseKey = trimmedKey;
      licenseStatus.error = null;
      await loadLicenseInfo();
      if (DEBUG) console.log('[License] Activation successful!');
      if (DEBUG) console.log('[License] ========== ACTIVATION END ==========');
      return { success: true, licenseStatus: { ...licenseStatus } };
    } else if (status === StatusCodes.LA_EXPIRED) {
      if (DEBUG) console.log('[License] Error: License expired');
      return { success: false, error: 'License has expired', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_SUSPENDED) {
      if (DEBUG) console.log('[License] Error: License suspended');
      return { success: false, error: 'License has been suspended', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_REVOKED) {
      if (DEBUG) console.log('[License] Error: License revoked');
      return { success: false, error: 'License has been revoked', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_PRODUCT_ID) {
      if (DEBUG) console.log('[License] Error: Invalid product ID');
      return { success: false, error: 'Invalid product ID', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_INET) {
      if (DEBUG) console.log('[License] Error: No internet connection');
      return { success: false, error: 'Internet connection required', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_ACTIVATION_LIMIT) {
      if (DEBUG) console.log('[License] Error: Activation limit reached');
      return { success: false, error: 'Activation limit reached', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_LICENSE_KEY) {
      if (DEBUG) console.log('[License] Error: Invalid license key');
      return { success: false, error: 'Invalid license key', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_AUTHENTICATION_FAILED) {
      if (DEBUG) console.log('[License] Error: Authentication failed');
      return { success: false, error: 'Authentication failed', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_COUNTRY) {
      if (DEBUG) console.log('[License] Error: Country restriction');
      return { success: false, error: 'Country restriction', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_IP) {
      if (DEBUG) console.log('[License] Error: IP restriction');
      return { success: false, error: 'IP restriction', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_RATE_LIMIT) {
      if (DEBUG) console.log('[License] Error: Rate limit exceeded');
      return { success: false, error: 'Request limit exceeded, please wait', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_SERVER) {
      if (DEBUG) console.log('[License] Error: Server error');
      return { success: false, error: 'Server error', code: status, codeName: statusName };
    } else if (status === StatusCodes.LA_E_CLIENT) {
      if (DEBUG) console.log('[License] Error: Client error');
      return { success: false, error: 'Client error', code: status, codeName: statusName };
    } else {
      if (DEBUG) console.log('[License] Error: Unknown status code:', status, statusName);
      return { success: false, error: `Activation failed (${statusName}, code: ${status})`, code: status, codeName: statusName };
    }

  } catch (error) {
    console.error('[License] Activation exception:', error);
    console.error('[License] Error name:', error.name);
    console.error('[License] Error message:', error.message);
    console.error('[License] Error stack:', error.stack);
    if (DEBUG) console.log('[License] ========== ACTIVATION END (ERROR) ==========');
    return { success: false, error: error.message };
  }
}

// Deactivate license
async function deactivateLicense() {
  if (DEBUG) console.log('[License] Deactivating license...');

  if (!LexActivator) {
    return { success: false, error: 'LexActivator not initialized' };
  }

  try {
    const status = LexActivator.DeactivateLicense();
    if (DEBUG) console.log('[License] DeactivateLicense status:', status);

    if (status === StatusCodes.LA_OK) {
      // Reset license status
      licenseStatus = {
        isValid: false,
        licenseKey: null,
        expiryDate: null,
        maxPhones: 5,
        remoteAccess: false,
        userName: null,
        userEmail: null,
        lastCheck: null,
        error: null
      };
      if (DEBUG) console.log('[License] Deactivation successful');
      return { success: true };
    } else {
      return { success: false, error: `Deactivation failed (code: ${status})` };
    }

  } catch (error) {
    console.error('[License] Deactivation error:', error.message);
    return { success: false, error: error.message };
  }
}

// Get current license info
function getLicenseInfo() {
  return { ...licenseStatus };
}

// Check if phone limit is exceeded
function canAddPhone(currentPhoneCount) {
  if (!licenseStatus.isValid) {
    return { allowed: false, reason: 'Invalid license' };
  }

  if (typeof currentPhoneCount !== 'number') {
    return { allowed: false, reason: 'Invalid phone count' };
  }

  if (currentPhoneCount >= licenseStatus.maxPhones) {
    return {
      allowed: false,
      reason: `Phone limit reached (maximum: ${licenseStatus.maxPhones})`
    };
  }

  return { allowed: true };
}

// Check if remote access is allowed
function isRemoteAccessAllowed() {
  if (!licenseStatus.isValid) {
    return { allowed: false, reason: 'Invalid license' };
  }

  if (!licenseStatus.remoteAccess) {
    return {
      allowed: false,
      reason: 'Remote access is not enabled for this license'
    };
  }

  return { allowed: true };
}

// Clean up LexActivator resources
function cleanup() {
  try {
    if (LexActivator) {
      LexActivator.Cleanup();
    }
  } catch (error) {
    console.error('[License] Cleanup error:', error.message);
  }
}

// Reset license (for testing/debugging)
function resetLicense() {
  try {
    if (LexActivator) {
      LexActivator.Reset();
    }
    licenseStatus = {
      isValid: false,
      licenseKey: null,
      expiryDate: null,
      maxPhones: 5,
      remoteAccess: false,
      userName: null,
      userEmail: null,
      lastCheck: null,
      error: null
    };
    if (DEBUG) console.log('[License] License reset');
    return { success: true };
  } catch (error) {
    console.error('[License] Reset error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  cleanup,
  initializeLexActivator,
  checkLicense,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
  canAddPhone,
  isRemoteAccessAllowed,
  resetLicense
};
