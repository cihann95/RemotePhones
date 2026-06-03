window.ErrorBoundary = (function() {
  function init() {
    window.onerror = function(msg, url, line, col, error) {
      if (window.PhoneFarmNotification) {
        PhoneFarmNotification.show('Something went wrong. The app may not work correctly.', 'error');
      }
      console.error('Error:', msg, url, line, col, error);
      return false;
    };
    
    window.onunhandledrejection = function(e) {
      if (window.PhoneFarmNotification) {
        PhoneFarmNotification.show('An unexpected error occurred.', 'error');
      }
      console.error('Unhandled rejection:', e);
    };
  }
  
  return { init };
})();

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.ErrorBoundary.init);
} else {
  window.ErrorBoundary.init();
}
