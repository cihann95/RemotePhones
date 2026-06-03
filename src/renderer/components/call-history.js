// =====================================================
// PHONE FARM V2 - CALL HISTORY PANEL
// Scrollable table with filters and CSV export
// =====================================================

window.CallHistory = (function () {
  let panel = null;
  let tableBody = null;
  let refreshTimer = null;
  let activeFilter = 'all';
  let isAutoRefreshing = false;

  /**
   * Render the call history panel into a container element.
   * @param {HTMLElement} container - The parent DOM node to render into
   */
  function init(container) {
    if (!container) return;

    panel = document.createElement('div');
    panel.className = 'call-history-panel';
    panel.innerHTML = `
      <div class="call-history-toolbar">
        <div class="call-history-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="completed">Completed</button>
          <button class="filter-btn" data-filter="missed">Missed</button>
          <button class="filter-btn" data-filter="rejected">Rejected</button>
        </div>
        <button class="btn btn-sm btn-outline export-btn" id="call-history-export">
          <span>Export</span>
        </button>
      </div>
      <div class="call-history-table-wrap">
        <table class="call-history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Number</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="call-history-tbody">
            <tr>
              <td colspan="4" class="text-center text-muted" style="padding: 32px;">
                Loading records...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    container.appendChild(panel);
    tableBody = panel.querySelector('#call-history-tbody');

    _bindFilterButtons();
    _bindExportButton();
    loadHistory();
  }

  /**
   * Bind filter button click handlers.
   */
  function _bindFilterButtons() {
    panel.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        panel.querySelectorAll('.filter-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        loadHistory();
      });
    });
  }

  /**
   * Bind the CSV export button.
   */
  function _bindExportButton() {
    var exportBtn = panel.querySelector('#call-history-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCSV);
    }
  }

  /**
   * Fetch call history records from the main process via IPC.
   */
  async function loadHistory() {
    try {
      var records = await window.electronAPI.getCallHistory();
      if (!Array.isArray(records)) records = [];
      _renderTable(records);
    } catch (e) {
      console.error('[CallHistory] Load error:', e);
      _renderTable([]);
    }
  }

  /**
   * Render rows into the table body.
   * @param {Array<object>} records - Call log records
   */
  function _renderTable(records) {
    if (!tableBody) return;

    var filtered = records;
    if (activeFilter !== 'all') {
      filtered = records.filter(function (r) {
        return r.status === activeFilter;
      });
    }

    if (filtered.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted" style="padding: 32px;">' +
        '<div class="empty-state-icon" style="font-size: 2.5rem; margin-bottom: 8px;">📞</div>' +
        'No records found</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var statusClass = 'status-' + (r.status || 'completed');
      var statusLabel = _statusLabel(r.status);
      var duration = _formatDuration(r.duration);
      var timestamp = _formatTimestamp(r.timestamp);

      html +=
        '<tr>' +
        '<td>' + _escapeHtml(timestamp) + '</td>' +
        '<td class="call-history-number">' + _escapeHtml(r.number || '---') + '</td>' +
        '<td>' + _escapeHtml(duration) + '</td>' +
        '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
        '</tr>';
    }
    tableBody.innerHTML = html;
  }

  /**
   * Return a human-readable label for a call status.
   * @param {string} status
   * @returns {string}
   */
  function _statusLabel(status) {
    var labels = {
      completed: 'Completed',
      missed: 'Missed',
      rejected: 'Rejected'
    };
    return labels[status] || status || '---';
  }

  /**
   * Format a duration value (seconds) into MM:SS.
   * @param {number} secs
   * @returns {string}
   */
  function _formatDuration(secs) {
    if (secs == null || isNaN(secs)) return '---';
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Format an ISO timestamp string for display.
   * @param {string} ts
   * @returns {string}
   */
  function _formatTimestamp(ts) {
    if (!ts) return '---';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      var day = d.getDate();
      var month = d.getMonth() + 1;
      var year = d.getFullYear();
      var hour = d.getHours();
      var min = d.getMinutes();
      return (day < 10 ? '0' : '') + day + '.' + (month < 10 ? '0' : '') + month + '.' + year +
        ' ' + (hour < 10 ? '0' : '') + hour + ':' + (min < 10 ? '0' : '') + min;
    } catch (e) {
      return ts;
    }
  }

  /**
   * Escape HTML to prevent XSS.
   * @param {string} text
   * @returns {string}
   */
  function _escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Export the currently visible (filtered) records to a CSV file download.
   */
  async function exportCSV() {
    try {
      var records = await window.electronAPI.getCallHistory();
      if (!Array.isArray(records)) records = [];

      var filtered = records;
      if (activeFilter !== 'all') {
        filtered = records.filter(function (r) {
          return r.status === activeFilter;
        });
      }

      if (filtered.length === 0) {
        if (window.PhoneFarmNotification) {
          window.PhoneFarmNotification.show('No records to export.', 'warning');
        }
        return;
      }

      var lines = ['Time,Number,Duration(s),Status'];
      for (var i = 0; i < filtered.length; i++) {
        var r = filtered[i];
        var num = (r.number || '').replace(/"/g, '""');
        var status = r.status || 'completed';
        var ts = r.timestamp || '';
        var dur = r.duration != null ? r.duration : '';
        lines.push('"' + ts + '","' + num + '",' + dur + ',' + status);
      }

      var csv = '\uFEFF' + lines.join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'call-history-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (window.PhoneFarmNotification) {
        window.PhoneFarmNotification.show('CSV exported.', 'success');
      }
    } catch (e) {
      console.error('[CallHistory] Export error:', e);
      if (window.PhoneFarmNotification) {
        window.PhoneFarmNotification.show('CSV export error.', 'error');
      }
    }
  }

  /**
   * Start auto-refreshing every 10 seconds.
   * Only polls while active (e.g. during active calls).
   */
  function startAutoRefresh() {
    if (isAutoRefreshing) return;
    isAutoRefreshing = true;
    refreshTimer = setInterval(function () {
      loadHistory();
    }, 10000);
  }

  /**
   * Stop the auto-refresh timer.
   */
  function stopAutoRefresh() {
    isAutoRefreshing = false;
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  /**
   * Clean up resources.
   */
  function destroy() {
    stopAutoRefresh();
    if (panel) {
      panel.remove();
      panel = null;
    }
    tableBody = null;
  }

  return {
    init: init,
    loadHistory: loadHistory,
    exportCSV: exportCSV,
    startAutoRefresh: startAutoRefresh,
    stopAutoRefresh: stopAutoRefresh,
    destroy: destroy
  };
})();
