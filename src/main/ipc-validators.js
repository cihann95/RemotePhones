// =====================================================
// PHONE FARM V2 - IPC INPUT VALIDATORS
// Shared validators for all ipcMain.handle() argument boundaries
// =====================================================

const { validateDeviceId, validateExecArg, ValidationError } = require('./device-id-validator');

/**
 * Validate and coerce a device ID argument from a renderer IPC call.
 * @param {any} value — raw value from renderer
 * @throws {ValidationError}
 */
function ipcDeviceId(value) {
  return validateDeviceId(value);
}

/**
 * Validate a text payload for ADB input.
 * Enforces max length, strips dangerous shell-sensitive sequences.
 */
const MAX_TEXT_LENGTH = 500; // ADB shell input max practical limit

function ipcDeviceText(value) {
  const text = String(value ?? '').trim();
  if (text.length === 0) return { success: false, error: 'Metin bos olamaz' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { success: false, error: `Metin cok uzun (maksimum ${MAX_TEXT_LENGTH} karakter)` };
  }
  // Strip null bytes and control characters
  const clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return { success: true, text: clean };
}

/**
 * Validate a keycode argument (must be a non-negative integer).
 */
function ipcKeycode(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 999) {
    throw new ValidationError(`Keycode must be a non-negative integer (0-999), got: ${value}`);
  }
  return Math.trunc(num);
}

/**
 * Validate a port argument (1-65535).
 */
function ipcPort(value) {
  const port = Number(value);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new ValidationError(`Port must be between 1 and 65535, got: ${value}`);
  }
  return Math.trunc(port);
}

module.exports = {
  ipcDeviceId,
  ipcDeviceText,
  ipcKeycode,
  ipcPort,
  ValidationError
};
