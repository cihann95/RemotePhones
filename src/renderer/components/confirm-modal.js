// =====================================================
// PHONE FARM V2 - THEMED CONFIRMATION MODAL
// =====================================================

window.PhoneFarmConfirmModal = (function() {
  let backdrop = null;
  let focusableElements = [];
  let previouslyFocused = null;

  function showConfirmModal({ title, message, confirmText, cancelText, onConfirm, onCancel } = {}) {
    if (backdrop) return;

    previouslyFocused = document.activeElement;

    confirmText = confirmText || 'Onayla';
    cancelText = cancelText || 'İptal';

    backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'confirm-modal-title');

    const card = document.createElement('div');
    card.className = 'confirm-modal-card';

    const titleEl = document.createElement('h2');
    titleEl.id = 'confirm-modal-title';
    titleEl.className = 'confirm-modal-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'confirm-modal-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'confirm-modal-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'confirm-modal-btn confirm-modal-confirm';
    confirmBtn.textContent = confirmText;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-modal-btn confirm-modal-cancel';
    cancelBtn.textContent = cancelText;

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(titleEl);
    card.appendChild(messageEl);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    focusableElements = [confirmBtn, cancelBtn];

    confirmBtn.addEventListener('click', () => {
      dismiss();
      if (typeof onConfirm === 'function') onConfirm();
    });

    cancelBtn.addEventListener('click', () => {
      dismiss();
      if (typeof onCancel === 'function') onCancel();
    });

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        dismiss();
        if (typeof onCancel === 'function') onCancel();
      }
    });

    // Keyboard: Enter = confirm, Escape = cancel
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        dismiss();
        if (typeof onCancel === 'function') onCancel();
      } else if (e.key === 'Enter') {
        dismiss();
        if (typeof onConfirm === 'function') onConfirm();
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus trap: cycle through confirm/cancel buttons
    function trapFocus(e) {
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Store keyHandler reference for cleanup
    backdrop._keyHandler = keyHandler;

    // Trigger animations in next frame
    requestAnimationFrame(() => {
      if (!backdrop || !backdrop.parentNode) return;
      backdrop.classList.add('confirm-modal-visible');
      card.classList.add('confirm-modal-card-visible');
    });

    // Focus the confirm button
    confirmBtn.focus();
  }

  function dismiss() {
    if (!backdrop) return;

    const card = backdrop.querySelector('.confirm-modal-card');

    // Remove listeners
    if (backdrop._keyHandler) {
      document.removeEventListener('keydown', backdrop._keyHandler);
      delete backdrop._keyHandler;
    }

    backdrop.classList.remove('confirm-modal-visible');
    if (card) card.classList.remove('confirm-modal-card-visible');

    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    backdrop = null;

    // Restore focus
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  }

  return { showConfirmModal, dismissConfirmModal: dismiss };
})();
