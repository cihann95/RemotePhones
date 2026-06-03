// =====================================================
// PHONE FARM V2 - LOADING SPINNER
// =====================================================

window.PhoneFarmLoading = (function() {
  let spinner = null;

  function show(message) {
    if (spinner) return;
    spinner = document.createElement('div');
    spinner.className = 'loading-overlay';
    spinner.innerHTML = `<div class="loading-spinner"></div><span class="loading-message">${message}</span>`;
    document.body.appendChild(spinner);
  }

  function hide() {
    if (spinner) {
      spinner.remove();
      spinner = null;
    }
  }

  return { show, hide };
})();
