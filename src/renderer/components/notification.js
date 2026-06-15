window.PhoneFarmNotification = (function() {
  let container = null;
  let queue = [];
  let visible = [];
  const MAX_VISIBLE = 3;
  const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const DEFAULTS = { success: 5000, warning: 5000, info: 5000, error: null };

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container';
      document.body.appendChild(container);
    }
  }

  function show(message, type = 'info', duration = null) {
    ensureContainer();
    if (duration === null) duration = DEFAULTS[type] || 5000;
    const id = Date.now() + Math.random();
    const el = document.createElement('div');
    el.className = `notification-item notification-${type}`;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'notification-icon';
    iconSpan.textContent = ICONS[type] || '';
    const msgSpan = document.createElement('span');
    msgSpan.className = 'notification-message';
    msgSpan.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-btn-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => dismiss(id));
    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    el.appendChild(closeBtn);
    el.dataset.id = id;
    
    if (visible.length >= MAX_VISIBLE) {
      const oldest = visible.shift();
      dismiss(oldest);
    }
    
    container.appendChild(el);
    visible.push(id);
    requestAnimationFrame(() => el.classList.add('notification-enter'));
    
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id) {
    const el = container?.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('notification-leave');
    el.addEventListener('animationend', () => {
      el.remove();
      visible = visible.filter(v => v !== id);
      if (container && container.children.length === 0) container.remove();
    });
  }

  function dismissAll() {
    [...visible].forEach(dismiss);
  }

  return { show, dismiss, dismissAll };
})();

if (window.electronAPI && window.electronAPI.onShowErrorNotification) {
  window.electronAPI.onShowErrorNotification(function(data) {
    if (data && data.title) {
      window.PhoneFarmNotification.show(
        data.title + (data.message ? ': ' + data.message : ''),
        'error'
      );
    }
  });
}
