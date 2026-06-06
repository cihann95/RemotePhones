// =====================================================
// PHONE FARM V2 - THEME INIT
// Runs on every renderer page. Reads the saved theme
// from electron-store via the preload bridge and sets
// the `data-theme` attribute on <html>.
// Default is dark (matches :root), so absent attribute
// means dark. Persisted values are 'light' | 'dark'.
// =====================================================

(function () {
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  if (window.electronAPI && typeof window.electronAPI.getTheme === 'function') {
    Promise.resolve(window.electronAPI.getTheme())
      .then(applyTheme)
      .catch(function () { /* keep dark default */ });
  }
})();
