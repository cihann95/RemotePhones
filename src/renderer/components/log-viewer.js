// =====================================================
// PHONE FARM V2 - LOG VIEWER PANEL
// Filterable + virtual-scrolled log table with CSV export
// =====================================================

window.LogViewer = (function () {
  const MAX_VISIBLE = 1000;
  const PAGE_SIZE = 200;
  const ROW_HEIGHT = 32;
  const VIEWPORT_MIN_HEIGHT = 420;

  let panel = null;
  let scrollEl = null;
  let spacerEl = null;
  let rowsHost = null;
  let statusEl = null;
  let loadMoreBtn = null;

  let filters = {
    text: '',
    range: 'all',
    level: 'all',
    from: '',
    to: ''
  };
  let entries = [];
  let total = 0;
  let loading = false;
  let scrollTop = 0;
  let viewportHeight = VIEWPORT_MIN_HEIGHT;
  let pool = [];

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function levelClass(level) {
    const lv = (level || 'info').toLowerCase();
    if (lv === 'error' || lv === 'err' || lv === 'fatal') return 'log-level-error';
    if (lv === 'warning' || lv === 'warn') return 'log-level-warning';
    if (lv === 'info') return 'log-level-info';
    return 'log-level-default';
  }

  function levelLabel(level) {
    const lv = (level || 'info').toLowerCase();
    if (lv === 'err' || lv === 'fatal') return 'ERROR';
    if (lv === 'warn') return 'WARN';
    return lv.toUpperCase();
  }

  function formatTs(ts) {
    if (!ts) return '---';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function computeSinceUntil() {
    if (filters.range === 'all') return { since: '', until: '' };
    const now = new Date();
    if (filters.range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { since: start.toISOString(), until: '' };
    }
    if (filters.range === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { since: start.toISOString(), until: '' };
    }
    if (filters.range === 'custom') {
      return { since: filters.from || '', until: filters.to || '' };
    }
    return { since: '', until: '' };
  }

  function setStatus(text, level) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'log-viewer-status';
    if (level) statusEl.classList.add('log-viewer-status-' + level);
  }

  function buildRowEl() {
    const row = document.createElement('div');
    row.className = 'log-viewer-row';
    row.innerHTML =
      '<span class="log-viewer-cell log-viewer-cell-ts"></span>' +
      '<span class="log-viewer-cell log-viewer-cell-level"></span>' +
      '<span class="log-viewer-cell log-viewer-cell-source"></span>' +
      '<span class="log-viewer-cell log-viewer-cell-message"></span>';
    return row;
  }

  function fillRowEl(el, entry) {
    el.classList.add(levelClass(entry.level));
    el.querySelector('.log-viewer-cell-ts').textContent = formatTs(entry.timestamp);
    const levelEl = el.querySelector('.log-viewer-cell-level');
    levelEl.textContent = levelLabel(entry.level);
    levelEl.className = 'log-viewer-cell log-viewer-cell-level log-level-badge ' + levelClass(entry.level);
    el.querySelector('.log-viewer-cell-source').textContent = entry.source || '---';
    el.querySelector('.log-viewer-cell-message').textContent = entry.message || '';
    el.style.height = ROW_HEIGHT + 'px';
  }

  function ensurePool(size) {
    while (pool.length < size) {
      pool.push(buildRowEl());
    }
    return pool;
  }

  function renderVisible() {
    if (!rowsHost || !spacerEl) return;
    spacerEl.style.height = (entries.length * ROW_HEIGHT) + 'px';
    rowsHost.style.height = viewportHeight + 'px';

    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
    const endIdx = Math.min(entries.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 5);
    const visibleCount = Math.max(0, endIdx - startIdx);
    const poolNodes = ensurePool(visibleCount);

    rowsHost.innerHTML = '';
    for (let i = 0; i < visibleCount; i++) {
      const entry = entries[startIdx + i];
      const node = poolNodes[i];
      fillRowEl(node, entry);
      node.style.transform = 'translateY(' + ((startIdx + i) * ROW_HEIGHT) + 'px)';
      node.style.position = 'absolute';
      node.style.left = '0';
      node.style.right = '0';
      rowsHost.appendChild(node);
    }
  }

  async function loadMore() {
    if (loading) return;
    if (entries.length >= Math.min(total, MAX_VISIBLE)) {
      if (loadMoreBtn) loadMoreBtn.disabled = true;
      return;
    }
    loading = true;
    if (loadMoreBtn) loadMoreBtn.disabled = true;
    setStatus('Loading...', 'info');

    try {
      if (!window.electronAPI || typeof window.electronAPI.getLogs !== 'function') {
        setStatus('Log API not available in this context', 'error');
        if (loadMoreBtn) loadMoreBtn.disabled = true;
        return;
      }
      const range = computeSinceUntil();
      const offset = entries.length;
      const remaining = MAX_VISIBLE - offset;
      const limit = Math.min(PAGE_SIZE, remaining);
      const res = await window.electronAPI.getLogs({
        offset: offset,
        limit: limit,
        level: filters.level,
        text: filters.text,
        since: range.since,
        until: range.until
      });
      const page = (res && Array.isArray(res.entries)) ? res.entries : [];
      total = (res && typeof res.total === 'number') ? res.total : total;
      for (let i = 0; i < page.length; i++) entries.push(page[i]);
      renderVisible();
      const shown = Math.min(entries.length, MAX_VISIBLE);
      setStatus('Showing ' + shown + ' of ' + total + ' entries', 'info');
      if (loadMoreBtn) {
        loadMoreBtn.disabled = !(entries.length < total && entries.length < MAX_VISIBLE);
      }
    } catch (e) {
      console.error('[LogViewer] load error:', e);
      setStatus('Failed to load logs', 'error');
    } finally {
      loading = false;
    }
  }

  async function reload() {
    entries = [];
    total = 0;
    scrollTop = 0;
    if (scrollEl) scrollEl.scrollTop = 0;
    if (loadMoreBtn) loadMoreBtn.disabled = false;
    await loadMore();
  }

  function bindEvents() {
    const textInput = panel.querySelector('#log-viewer-text');
    let debounce = null;
    textInput.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        filters.text = (textInput.value || '').trim();
        reload();
      }, 250);
    });

    panel.querySelectorAll('[data-log-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel.querySelectorAll('[data-log-range]').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        filters.range = btn.dataset.logRange;
        const customWrap = panel.querySelector('#log-viewer-custom-range');
        if (customWrap) {
          customWrap.style.display = filters.range === 'custom' ? 'flex' : 'none';
        }
        reload();
      });
    });

    panel.querySelectorAll('[data-log-level]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel.querySelectorAll('[data-log-level]').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        filters.level = btn.dataset.logLevel;
        reload();
      });
    });

    const fromInput = panel.querySelector('#log-viewer-from');
    const toInput = panel.querySelector('#log-viewer-to');
    if (fromInput) {
      fromInput.addEventListener('change', function () {
        filters.from = fromInput.value ? new Date(fromInput.value).toISOString() : '';
        if (filters.range === 'custom') reload();
      });
    }
    if (toInput) {
      toInput.addEventListener('change', function () {
        filters.to = toInput.value ? new Date(toInput.value).toISOString() : '';
        if (filters.range === 'custom') reload();
      });
    }

    panel.querySelector('#log-viewer-export').addEventListener('click', exportCSV);
    panel.querySelector('#log-viewer-refresh').addEventListener('click', reload);

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }

    if (scrollEl) {
      let scrollRaf = null;
      scrollEl.addEventListener('scroll', function () {
        scrollTop = scrollEl.scrollTop;
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(function () {
          scrollRaf = null;
          renderVisible();
          if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 80) {
            if (entries.length < total && entries.length < MAX_VISIBLE) {
              loadMore();
            }
          }
        });
      });
    }

    const resizeObs = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(function () {
      if (scrollEl) {
        viewportHeight = Math.max(VIEWPORT_MIN_HEIGHT, scrollEl.clientHeight);
        renderVisible();
      }
    }) : null;
    if (resizeObs && scrollEl) resizeObs.observe(scrollEl);
  }

  async function exportCSV() {
    try {
      const range = computeSinceUntil();
      const res = await window.electronAPI.getLogs({
        offset: 0,
        limit: MAX_VISIBLE,
        level: filters.level,
        text: filters.text,
        since: range.since,
        until: range.until
      });
      const list = (res && Array.isArray(res.entries)) ? res.entries : [];
      if (list.length === 0) {
        if (window.PhoneFarmNotification) {
          window.PhoneFarmNotification.show('No log entries to export.', 'warning');
        }
        return;
      }
      const lines = ['Timestamp,Level,Source,Message'];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const ts = (r.timestamp || '').replace(/"/g, '""');
        const lv = (r.level || '').replace(/"/g, '""');
        const src = (r.source || '').replace(/"/g, '""');
        const msg = (r.message || '').replace(/"/g, '""');
        lines.push('"' + ts + '","' + lv + '","' + src + '","' + msg + '"');
      }
      const csv = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'logs-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (window.PhoneFarmNotification) {
        window.PhoneFarmNotification.show('CSV exported (' + list.length + ' entries).', 'success');
      }
    } catch (e) {
      console.error('[LogViewer] export error:', e);
      if (window.PhoneFarmNotification) {
        window.PhoneFarmNotification.show('CSV export error.', 'error');
      }
    }
  }

  function init(container) {
    if (!container) return;
    panel = document.createElement('div');
    panel.className = 'log-viewer';
    panel.innerHTML =
      '<div class="log-viewer-toolbar">' +
        '<div class="log-viewer-row log-viewer-row-filters">' +
          '<input type="text" id="log-viewer-text" class="log-viewer-text-input" placeholder="Search messages or sources..." aria-label="Search logs">' +
          '<div class="log-viewer-filter-group" role="group" aria-label="Date range">' +
            '<button class="filter-btn" data-log-range="all">All</button>' +
            '<button class="filter-btn active" data-log-range="today">Today</button>' +
            '<button class="filter-btn" data-log-range="7d">7 Days</button>' +
            '<button class="filter-btn" data-log-range="custom">Custom</button>' +
          '</div>' +
          '<div class="log-viewer-filter-group" role="group" aria-label="Log level">' +
            '<button class="filter-btn active" data-log-level="all">All</button>' +
            '<button class="filter-btn" data-log-level="info">INFO</button>' +
            '<button class="filter-btn" data-log-level="warning">WARN</button>' +
            '<button class="filter-btn" data-log-level="error">ERROR</button>' +
          '</div>' +
          '<div id="log-viewer-custom-range" class="log-viewer-custom-range" style="display:none;">' +
            '<input type="date" id="log-viewer-from" class="log-viewer-date-input" aria-label="From date">' +
            '<span class="log-viewer-date-sep">→</span>' +
            '<input type="date" id="log-viewer-to" class="log-viewer-date-input" aria-label="To date">' +
          '</div>' +
        '</div>' +
        '<div class="log-viewer-row log-viewer-row-actions">' +
          '<span id="log-viewer-status" class="log-viewer-status">Loading...</span>' +
          '<div class="log-viewer-actions">' +
            '<button class="btn btn-sm btn-outline" id="log-viewer-refresh" aria-label="Refresh logs">🔄 Refresh</button>' +
            '<button class="btn btn-sm btn-outline" id="log-viewer-export" aria-label="Export logs as CSV">⬇ Export CSV</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="log-viewer-scroll" id="log-viewer-scroll">' +
        '<div class="log-viewer-header">' +
          '<span class="log-viewer-cell log-viewer-cell-ts">Timestamp</span>' +
          '<span class="log-viewer-cell log-viewer-cell-level">Level</span>' +
          '<span class="log-viewer-cell log-viewer-cell-source">Source</span>' +
          '<span class="log-viewer-cell log-viewer-cell-message">Message</span>' +
        '</div>' +
        '<div class="log-viewer-spacer" id="log-viewer-spacer">' +
          '<div class="log-viewer-rows" id="log-viewer-rows"></div>' +
        '</div>' +
      '</div>' +
      '<div class="log-viewer-footer">' +
        '<button class="btn btn-sm btn-outline" id="log-viewer-load-more">Load more</button>' +
        '<span class="log-viewer-foot-hint">Max ' + MAX_VISIBLE + ' entries shown for performance</span>' +
      '</div>';

    container.appendChild(panel);

    scrollEl = panel.querySelector('#log-viewer-scroll');
    spacerEl = panel.querySelector('#log-viewer-spacer');
    rowsHost = panel.querySelector('#log-viewer-rows');
    statusEl = panel.querySelector('#log-viewer-status');
    loadMoreBtn = panel.querySelector('#log-viewer-load-more');

    bindEvents();
    reload();
  }

  function destroy() {
    if (panel) {
      panel.remove();
      panel = null;
    }
    scrollEl = null;
    spacerEl = null;
    rowsHost = null;
    statusEl = null;
    loadMoreBtn = null;
    entries = [];
    total = 0;
    pool = [];
  }

  return {
    init: init,
    reload: reload,
    exportCSV: exportCSV,
    destroy: destroy
  };
})();
