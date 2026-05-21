// =====================================================
// PHONE FARM V2 - ABOUT RENDERER
// =====================================================

document.getElementById('btn-close').addEventListener('click', async () => {
  await window.electronAPI.closeAbout();
});
