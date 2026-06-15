window.ErrorBoundary = (function() {
  var MAX_RETRIES = 3;
  var retryCount = 0;
  var overlayVisible = false;

  var ERROR_MSG_RUNTIME = 'Bir hata oluştu. Uygulama düzgün çalışmayabilir.';
  var ERROR_MSG_PROMISE = 'Beklenmeyen bir hata oluştu.';
  var BTN_RETRY = 'Tekrar Dene';
  var BTN_RESTART = 'Yeniden Başlat';
  var RETRY_DISABLED_MSG = 'Maksimum deneme sayısına ulaşıldı';

  function createOverlay(message) {
    if (overlayVisible) return;
    overlayVisible = true;

    var backdrop = document.createElement('div');
    backdrop.className = 'error-boundary-backdrop';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'error-boundary-title');

    var card = document.createElement('div');
    card.className = 'error-boundary-card';

    var icon = document.createElement('div');
    icon.className = 'error-boundary-icon';
    icon.textContent = '⚠️';

    var title = document.createElement('h3');
    title.id = 'error-boundary-title';
    title.className = 'error-boundary-title';
    title.textContent = message;

    var actions = document.createElement('div');
    actions.className = 'error-boundary-actions';

    var retryBtn = document.createElement('button');
    retryBtn.className = 'error-boundary-btn error-boundary-btn-retry';
    retryBtn.textContent = BTN_RETRY;
    if (retryCount >= MAX_RETRIES) {
      retryBtn.disabled = true;
      retryBtn.title = RETRY_DISABLED_MSG;
    }
    retryBtn.addEventListener('click', function() {
      retryCount++;
      overlayVisible = false;
      backdrop.remove();
      // Force a re-render by reloading the page
      if (typeof location !== 'undefined' && location.reload) {
        location.reload();
      }
    });

    var restartBtn = document.createElement('button');
    restartBtn.className = 'error-boundary-btn error-boundary-btn-restart';
    restartBtn.textContent = BTN_RESTART;
    restartBtn.addEventListener('click', function() {
      if (window.electronAPI && typeof window.electronAPI.relaunch === 'function') {
        window.electronAPI.relaunch();
      }
    });

    actions.appendChild(retryBtn);
    actions.appendChild(restartBtn);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(function() {
      backdrop.classList.add('error-boundary-visible');
    });
  }

  function init() {
    window.onerror = function(msg, url, line, col, error) {
      console.error('Hata:', msg, url, line, col, error);
      createOverlay(ERROR_MSG_RUNTIME);
      return false;
    };

    window.onunhandledrejection = function(e) {
      console.error('İşlenmeyen reddetme:', e);
      createOverlay(ERROR_MSG_PROMISE);
    };
  }

  function reset() {
    retryCount = 0;
    overlayVisible = false;
    var existing = document.querySelector('.error-boundary-backdrop');
    if (existing) existing.remove();
  }

  function getRetryCount() {
    return retryCount;
  }

  function isOverlayVisible() {
    return overlayVisible;
  }

  return { init: init, reset: reset, getRetryCount: getRetryCount, isOverlayVisible: isOverlayVisible };
})();

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.ErrorBoundary.init);
} else {
  window.ErrorBoundary.init();
}