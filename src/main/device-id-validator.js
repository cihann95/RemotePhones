// =====================================================
// PHONE FARM V2 - DEVICE ID VALIDATOR
// Shared validation for all device-ID inputs across IPC handlers
// =====================================================

// Standard ADB serial formats:
// USB device:              0123456789ABCDEF  (16 hex chars)
// TCP/IP device:           192.168.1.42:5555 (IPv4 + : + port)
// Emulator device:         emulator-5554
// Qualcomm emergency mode: 0123456789ABCDEF:0 (device:sub-channel)

// Regex covers all four:
// - 16 hex (USB / emergency mode base)
// - IPv4[:port] (TCP/IP)
// - emulator-NNNN
const VALID_DEVICE_ID = /^(?:[0-9A-Fa-f]{16}|(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}|emulator-\d+)$/;

/**
 * Validate an ADB device identifier.
 * Returns the cleaned ID string on success, throws ValidationError on failure.
 */
function validateDeviceId(rawId) {
  if (typeof rawId !== 'string') {
    throw new ValidationError('Device ID must be a string');
  }
  const id = rawId.trim();
  if (id.length === 0) {
    throw new ValidationError('Device ID cannot be empty');
  }
  if (!VALID_DEVICE_ID.test(id)) {
    throw new ValidationError(
      `Invalid device ID format: ${id}. Expected 16 hex chars, IPv4:port, or emulator-NNNN.`
    );
  }
  return id;
}

/**
 * Validate that a string is safe to pass as a single `exec` argument value
 * (not a command string — the call site must still use execFile / argv array).
 * Rejects control characters, null bytes, and obvious shell metacharacters.
 */
function validateExecArg(value, label) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a string`);
  }
  // No null bytes, no raw control characters
  if (/\x00/.test(value) || /[\x01-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
    throw new ValidationError(`${label} contains forbidden control characters`);
  }
  return value;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

module.exports = {
  validateDeviceId,
  validateExecArg,
  ValidationError,
  VALID_DEVICE_ID
};
