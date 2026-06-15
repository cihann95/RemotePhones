// =====================================================
// PHONE FARM V2 - ABOUT RENDERER
// =====================================================

(async () => {
  try {
    const appInfo = await window.electronAPI.getAppInfo();
    const verEl = document.getElementById('app-version');
    if (verEl && appInfo) verEl.textContent = appInfo.version;
  } catch (e) {
    console.error('Failed to load app version:', e);
  }
})();

document.getElementById('btn-close').addEventListener('click', async () => {
  await window.electronAPI.closeAbout();
});
