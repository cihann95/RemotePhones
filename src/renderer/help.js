// =====================================================
// PHONE FARM V2 - HELP RENDERER
// =====================================================

// Back button
document.getElementById('btn-back').addEventListener('click', async () => {
  await window.electronAPI.navigateToMain();
});

// FAQ toggle functionality (replacing inline onclick handlers)
document.querySelectorAll('.faq-question').forEach((question) => {
  question.addEventListener('click', () => {
    question.parentElement.classList.toggle('open');
  });
});
