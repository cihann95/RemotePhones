// =====================================================
// PHONE FARM V2 - SHORTCUT MANAGER
// Keyboard shortcuts management
// =====================================================

const { globalShortcut, BrowserWindow } = require('electron');

class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
    this.handlers = {};
  }

  /**
   * Set handler functions
   */
  setHandlers(handlers) {
    this.handlers = handlers;
  }

  /**
   * Register all global shortcuts
   */
  registerAll() {
    if (!this.handlers || !this.enabled) return;

    for (const [key, handler] of Object.entries(this.handlers)) {
      try {
        const registered = globalShortcut.register(key, handler);
        if (registered) {
          this.shortcuts.set(key, true);
        } else {
          console.warn(`[Shortcuts] Failed to register: ${key}`);
        }
      } catch (err) {
        console.warn(`[Shortcuts] Error registering "${key}":`, err.message);
      }
    }
  }

  /**
   * Unregister all shortcuts
   */
  unregisterAll() {
    for (const key of this.shortcuts.keys()) {
      globalShortcut.unregister(key);
    }
    this.shortcuts.clear();
    globalShortcut.unregisterAll();
  }

  /**
   * Enable/disable shortcuts
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.unregisterAll();
    } else {
      this.registerAll();
    }
  }

  /**
   * Get shortcut list for UI
   */
  getShortcutList() {
    return [
      { key: 'Ctrl+1-9', action: 'Telefon sec', description: 'Ilgili siradaki telefonu sec' },
      { key: 'Ctrl+A', action: 'Tumunu ac', description: 'Tum telefon pencerelerini ac' },
      { key: 'Ctrl+W', action: 'Pencere kapat', description: 'Secili pencereyi kapat' },
      { key: 'Ctrl+Shift+W', action: 'Tumunu kapat', description: 'Tum pencereleri kapat' },
      { key: 'Ctrl+R / F5', action: 'Yenile', description: 'Cihaz listesini yenile' },
      { key: 'Ctrl+S', action: 'Baslat/Durdur', description: 'Farm\'i baslat veya durdur' },
      { key: 'Ctrl+,', action: 'Ayarlar', description: 'Ayarlar penceresini ac' },
      { key: 'F11', action: 'Tam ekran', description: 'Tam ekran modu' },
      { key: 'Escape', action: 'Kapat', description: 'Modal veya popup kapat' },
      { key: '?', action: 'Kisayollar', description: 'Bu listeyi goster' }
    ];
  }
}

module.exports = ShortcutManager;
