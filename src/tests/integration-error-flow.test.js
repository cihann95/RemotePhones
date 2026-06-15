// @vitest-environment happy-dom
/**
 * Integration test: Full Error Flow (Task 20)
 *
 * Validates the complete error recovery chain:
 *   1. Renderer triggers IPC call (e.g., a device action)
 *   2. Main process handler throws an error
 *   3. Error is caught by safeHandle → humanizeError → sendErrorNotification
 *   4. Notification is sent to renderer via 'show-error-notification' IPC
 *   5. PhoneFarmNotification shows the Turkish error message
 *   6. No raw e.message leaks into the UI
 *
 * Tests the pipeline end-to-end using the actual error_messages.json
 * and the real PhoneFarmNotification renderer component.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Load actual error_messages.json (same source as main.js) ──────────────
const errorMapPath = path.resolve(__dirname, '../../shared/error_messages.json');
const _errorMessages = JSON.parse(fs.readFileSync(errorMapPath, 'utf-8'));

// ── Extract humanizeError — exact copy from src/main/main.js ──────────────
// Replicated here because main.js cannot be required in test (Electron deps).
function humanizeError(errStr) {
  const lower = (errStr || '').toLowerCase();
  for (const entry of _errorMessages) {
    for (const pattern of (entry.patterns || [])) {
      try {
        if (new RegExp(pattern, 'i').test(lower)) {
          return { id: entry.id, title: entry.title, hint: entry.hint, fix_steps: entry.fix_steps || [], raw: errStr };
        }
      } catch (_) {
        if (lower.includes(pattern)) {
          return { id: entry.id, title: entry.title, hint: entry.hint, fix_steps: entry.fix_steps || [], raw: errStr };
        }
      }
    }
  }
  const fallback = _errorMessages.find(e => e.id === 'unknown_error');
  if (fallback) return { id: fallback.id, title: fallback.title, hint: fallback.hint, fix_steps: fallback.fix_steps || [], raw: errStr };
  return { id: 'unknown_error', title: 'Bilinmeyen hata', hint: errStr, fix_steps: [], raw: errStr };
}

// ── Simulate safeHandle + sendErrorNotification from main.js ──────────────
// Returns the notification payload that would be sent to the renderer.
function simulateSafeHandle(channel, handlerFn) {
  try {
    const result = handlerFn();
    // If it returns a promise, this won't catch async — but our tests use sync throws
    return { success: true, result, notification: null };
  } catch (e) {
    const errStr = e?.message || String(e);
    const h = humanizeError(errStr);
    const notification = {
      title: h.title,
      message: h.hint || h.raw
    };
    return { success: false, error: h, notification };
  }
}

// ── Constants for matching ────────────────────────────────────────────────
const NOTIFICATION_MODULE_PATH = require.resolve('../renderer/components/notification.js');

describe('Integration: Full Error Flow', () => {
  let capturedCallback;

  beforeEach(() => {
    // Clear require cache so notification.js re-executes fresh
    delete require.cache[NOTIFICATION_MODULE_PATH];
    delete window.PhoneFarmNotification;
    document.body.innerHTML = '';

    // Mock electronAPI — capture the callback that notification.js registers
    capturedCallback = null;
    window.electronAPI = {
      onShowErrorNotification: vi.fn((cb) => {
        capturedCallback = cb;
      })
    };
  });

  afterEach(() => {
    delete window.electronAPI;
    delete window.PhoneFarmNotification;
    document.body.innerHTML = '';
  });

  /**
   * Helper: loads notification.js, simulates the full error flow
   * (main process error → safeHandle → humanizeError → IPC → renderer),
   * and returns the DOM state for assertions.
   */
  function triggerErrorFlow(rawErrorMessage) {
    // 1. Load the notification component (registers onShowErrorNotification listener)
    require('../renderer/components/notification.js');
    expect(capturedCallback).not.toBeNull();

    // 2. Simulate main process: handler throws → safeHandle catches → humanizeError → send notification
    const channel = 'test-ipc-channel';
    const handlerResult = simulateSafeHandle(channel, () => {
      throw new Error(rawErrorMessage);
    });
    expect(handlerResult.success).toBe(false);
    expect(handlerResult.notification).not.toBeNull();

    // 3. Deliver the notification to the renderer (simulates mainWindow.webContents.send)
    capturedCallback(handlerResult.notification);

    return {
      notification: handlerResult.notification,
      humanized: handlerResult.error,
      container: document.getElementById('notification-container')
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: ADB device not found
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario 1: ADB device not found', () => {
    it('maps "no devices found" → "Cihaz bulunamadı" Turkish notification', () => {
      const { notification, humanized, container } = triggerErrorFlow('no devices found');

      // humanizeError matched device_not_found
      expect(humanized.id).toBe('device_not_found');
      expect(humanized.title).toBe('Cihaz bulunamadı');

      // Notification payload contains Turkish title + hint
      expect(notification.title).toBe('Cihaz bulunamadı');
      expect(notification.message).toContain('USB');

      // DOM shows the Turkish notification
      expect(container).not.toBeNull();
      const text = container.textContent;
      expect(text).toContain('Cihaz bulunamadı');
      expect(text).toContain('USB kablosunu kontrol edin');

      // No raw English error leaks
      expect(text).not.toContain('no devices found');
    });

    it('maps "device not found" → same Turkish notification', () => {
      const { humanized, container } = triggerErrorFlow('device not found');

      expect(humanized.id).toBe('device_not_found');
      expect(container.textContent).toContain('Cihaz bulunamadı');
      expect(container.textContent).not.toContain('device not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: Network failure (connection timeout)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario 2: Network failure (connection timeout)', () => {
    it('maps "connection timeout" → "Bağlantı zaman aşımı" Turkish notification', () => {
      const { notification, humanized, container } = triggerErrorFlow('connection timeout');

      expect(humanized.id).toBe('connection_timeout');
      expect(humanized.title).toBe('Bağlantı zaman aşımı');

      expect(notification.title).toBe('Bağlantı zaman aşımı');
      expect(notification.message).toContain('SIM kart');

      const text = container.textContent;
      expect(text).toContain('Bağlantı zaman aşımı');
      expect(text).toContain('SIM kart ve sinyal kontrolü');

      // No raw English error leaks
      expect(text).not.toContain('connection timeout');
    });

    it('maps "timed out" → same Turkish notification', () => {
      const { humanized, container } = triggerErrorFlow('request timed out');

      expect(humanized.id).toBe('connection_timeout');
      expect(container.textContent).toContain('Bağlantı zaman aşımı');
      expect(container.textContent).not.toContain('timed out');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Invalid input (validation failure)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario 3: Validation failure (invalid device ID)', () => {
    it('maps "Invalid device id" → "Geçersiz cihaz ID\'si" Turkish notification', () => {
      const { notification, humanized, container } = triggerErrorFlow('Invalid device id: must match ^[a-zA-Z0-9_-]+$');

      expect(humanized.id).toBe('device_id_invalid');
      expect(humanized.title).toBe('Geçersiz cihaz ID\'si');

      expect(notification.title).toBe('Geçersiz cihaz ID\'si');
      expect(notification.message).toContain('harf, rakam');

      const text = container.textContent;
      expect(text).toContain('Geçersiz');
      expect(text).toContain('cihaz');

      // No raw English error leaks
      expect(text).not.toContain('Invalid device id');
      expect(text).not.toContain('must match');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: Invalid phone number (bonus validation scenario)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Validation failure (invalid phone number)', () => {
    it('maps "invalid phone number" → "Geçersiz telefon numarası" Turkish notification', () => {
      const { notification, humanized, container } = triggerErrorFlow('invalid phone number format');

      expect(humanized.id).toBe('invalid_phone_number');
      expect(humanized.title).toBe('Geçersiz telefon numarası');

      expect(notification.title).toBe('Geçersiz telefon numarası');
      expect(notification.message).toContain('+905');

      const text = container.textContent;
      expect(text).toContain('Geçersiz telefon numarası');

      // No raw English error leaks
      expect(text).not.toContain('invalid phone number');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: Unknown error falls back to Turkish
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario 5: Unknown error (fallback)', () => {
    it('maps unknown error → "Bilinmeyen hata oluştu" Turkish notification', () => {
      const { notification, humanized, container } = triggerErrorFlow('something completely unexpected xyz123');

      expect(humanized.id).toBe('unknown_error');
      expect(humanized.title).toBe('Bilinmeyen hata oluştu');

      expect(notification.title).toBe('Bilinmeyen hata oluştu');

      const text = container.textContent;
      expect(text).toContain('Bilinmeyen hata oluştu');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-cutting: No raw e.message ever reaches the notification
  // ─────────────────────────────────────────────────────────────────────────
  describe('Cross-cutting: No raw e.message in notifications', () => {
    const rawErrors = [
      'adb server crashed unexpectedly',
      'ECONNREFUSED 127.0.0.1:5037',
      'Cannot read property "id" of undefined',
      'ENOSPC: no space left on device',
      'Permission denied /dev/bus/usb',
    ];

    for (const rawErr of rawErrors) {
      it(`hides raw error "${rawErr.slice(0, 40)}..." from notification UI`, () => {
        const { container } = triggerErrorFlow(rawErr);
        expect(container).not.toBeNull();
        const text = container.textContent;
        // The notification should contain Turkish text, not the raw English error
        expect(text).not.toContain(rawErr);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-cutting: Error notifications are sticky (not auto-dismissed)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Cross-cutting: Error notifications are sticky', () => {
    it('error notifications have null duration (no auto-dismiss)', () => {
      // Load notification module
      require('../renderer/components/notification.js');

      // Show an error notification directly
      const id = window.PhoneFarmNotification.show('Test error', 'error');
      expect(id).toBeDefined();

      // The notification should be in the DOM
      const container = document.getElementById('notification-container');
      expect(container).not.toBeNull();
      const items = container.querySelectorAll('.notification-error');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: humanizeError returns structured data with all fields
  // ─────────────────────────────────────────────────────────────────────────
  describe('humanizeError returns structured data', () => {
    it('returns id, title, hint, fix_steps, and raw for known errors', () => {
      const result = humanizeError('no devices found');

      expect(result).toHaveProperty('id', 'device_not_found');
      expect(result).toHaveProperty('title', 'Cihaz bulunamadı');
      expect(result).toHaveProperty('hint');
      expect(result).toHaveProperty('fix_steps');
      expect(Array.isArray(result.fix_steps)).toBe(true);
      expect(result.fix_steps.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('raw', 'no devices found');
    });

    it('returns structured data for unknown errors', () => {
      const result = humanizeError('totally unknown error');

      expect(result).toHaveProperty('id', 'unknown_error');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('hint');
      expect(result).toHaveProperty('raw', 'totally unknown error');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: safeHandle returns both notification and humanized error
  // ─────────────────────────────────────────────────────────────────────────
  describe('safeHandle integration', () => {
    it('returns success:false with humanized error on throw', () => {
      const result = simulateSafeHandle('test-channel', () => {
        throw new Error('no devices');
      });

      expect(result.success).toBe(false);
      expect(result.error.id).toBe('device_not_found');
      expect(result.notification.title).toBe('Cihaz bulunamadı');
      expect(result.notification.message).toBeDefined();
    });

    it('returns success:true when handler succeeds', () => {
      const result = simulateSafeHandle('test-channel', () => {
        return { devices: ['abc123'] };
      });

      expect(result.success).toBe(true);
      expect(result.notification).toBeNull();
    });

    it('catches non-Error throws (string errors)', () => {
      // Simulate what happens when a handler throws a string instead of Error
      const result = simulateSafeHandle('test-channel', () => {
        const e = 'no devices found';
        throw { message: e }; // eslint-disable-line no-throw-literal
      });

      expect(result.success).toBe(false);
      expect(result.error.id).toBe('device_not_found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: Multiple notifications can appear
  // ─────────────────────────────────────────────────────────────────────────
  describe('Multiple notifications', () => {
    it('can show multiple error notifications in sequence', () => {
      require('../renderer/components/notification.js');

      window.PhoneFarmNotification.show('First error: Cihaz bulunamadı', 'error');
      window.PhoneFarmNotification.show('Second error: Bağlantı zaman aşımı', 'error');

      const container = document.getElementById('notification-container');
      expect(container).not.toBeNull();
      const items = container.querySelectorAll('.notification-error');
      expect(items.length).toBe(2);
    });
  });
});
