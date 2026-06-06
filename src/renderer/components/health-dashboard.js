// =====================================================
// PHONE FARM V2 - HEALTH DASHBOARD PANEL
// Device health monitoring with auto-refresh + 24h trends
// =====================================================

function _escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.HealthDashboard = (function () {
  const REFRESH_INTERVAL = 30000;
  const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;          // sample every 5 minutes
  const RING_BUFFER_HOURS = 24;                      // last 24 hours window
  const RING_BUFFER_MS = RING_BUFFER_HOURS * 60 * 60 * 1000; // 86400000
  const RING_BUFFER_CAPACITY = 288;                  // 24h * 12 samples/h = 288

  const BATTERY_LOW = 15;
  const TEMP_HIGH = 50;
  const SIGNAL_WEAK = -100;

  const ZOOM_OPTIONS = [
    { id: '1h', label: '1h', hours: 1 },
    { id: '6h', label: '6h', hours: 6 },
    { id: '24h', label: '24h', hours: 24 }
  ];

  let refreshTimer = null;
  let panelEl = null;
  let devices = [];

  // Per-device trend state
  // ring buffer holds the last 24h of samples (one slot per 5-minute window)
  const trendBuffers = new Map();   // deviceId -> RingBuffer
  const lastSampleAt = new Map();    // deviceId -> ms timestamp
  const zoomByDevice = new Map();    // deviceId -> hours (1, 6, or 24)

  // =====================================================
  // RING BUFFER
  // Fixed-capacity circular buffer for 24h time-series data.
  // capacity = 288 slots (24 hours * 60 min / 5 min per slot).
  // Oldest samples are overwritten when the buffer is full.
  // =====================================================
  function RingBuffer(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.head = 0;   // next write index
    this.size = 0;   // current number of stored samples (<= capacity)
  }

  RingBuffer.prototype.push = function (item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  };

  RingBuffer.prototype.toArray = function () {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return this.buffer.slice(this.head).concat(this.buffer.slice(0, this.head));
  };

  RingBuffer.prototype.getWindow = function (windowMs) {
    const cutoff = Date.now() - windowMs;
    return this.toArray().filter(function (item) { return item.t >= cutoff; });
  };

  RingBuffer.prototype.latest = function () {
    if (this.size === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  };

  RingBuffer.prototype.clear = function () {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  };

  function getBuffer(deviceId) {
    let buf = trendBuffers.get(deviceId);
    if (!buf) {
      buf = new RingBuffer(RING_BUFFER_CAPACITY);
      trendBuffers.set(deviceId, buf);
    }
    return buf;
  }

  function badgeClass(level) {
    if (level === 'green') return 'health-badge badge-green';
    if (level === 'warning') return 'health-badge badge-yellow';
    return 'health-badge badge-red';
  }

  function batteryLevel(pct) {
    if (pct <= BATTERY_LOW) return 'red';
    if (pct <= 30) return 'warning';
    return 'green';
  }

  function tempLevel(celsius) {
    if (celsius >= TEMP_HIGH) return 'red';
    if (celsius >= 40) return 'warning';
    return 'green';
  }

  function signalLevel(dbm) {
    if (dbm === null || dbm === undefined) return 'yellow';
    if (dbm >= SIGNAL_WEAK) return 'green';
    if (dbm >= -110) return 'warning';
    return 'red';
  }

  function simLevel(state) {
    if (!state || state === 'UNKNOWN' || state === 'ABSENT') return 'red';
    if (state === 'READY') return 'green';
    return 'yellow';
  }

  function memoryLevel(usedPct) {
    if (usedPct >= 90) return 'red';
    if (usedPct >= 75) return 'warning';
    return 'green';
  }

  function badge(text, level) {
    return '<span class="' + badgeClass(level) + '">' + text + '</span>';
  }

  function metricRow(icon, label, valueHtml) {
    return '<div class="health-metric">' +
      '<span class="health-metric-label">' + icon + ' ' + label + '</span>' +
      '<span class="health-metric-value">' + valueHtml + '</span>' +
    '</div>';
  }

  // =====================================================
  // CSS-ONLY SVG LINE CHART
  // Pure SVG geometry, CSS-driven colors via class names.
  // No third-party charting library, no canvas, no animation libs.
  // =====================================================
  function renderLineChart(samples, opts) {
    const width = 300;
    const height = 80;
    const padL = 28;
    const padR = 10;
    const padT = 8;
    const padB = 18;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const min = typeof opts.min === 'number' ? opts.min : 0;
    const max = typeof opts.max === 'number' ? opts.max : 100;
    const range = max - min;
    const unit = opts.unit || '%';
    const lineClass = opts.lineClass || '';
    const dotClass = opts.dotClass || '';

    // Horizontal grid lines + Y axis labels (4 ticks: 0, 25, 50, 75, 100)
    const grid = [];
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const ratio = i / ticks;
      const y = padT + plotH * ratio;
      const value = max - range * ratio;
      grid.push('<line class="health-trend-gridline" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y.toFixed(1) + '" />');
      grid.push('<text class="health-trend-axis-label" x="' + (padL - 4) + '" y="' + (y + 3).toFixed(1) + '">' + Math.round(value) + '</text>');
    }

    if (!samples || samples.length === 0) {
      return '<svg class="health-trend-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-label="' + _escapeHtml(opts.label || 'chart') + ' (no data)">' +
        '<g class="health-trend-grid">' + grid.join('') + '</g>' +
        '<text class="health-trend-empty-text" x="' + (width / 2) + '" y="' + (height / 2) + '" text-anchor="middle">No data</text>' +
        '</svg>';
    }

    // Build polyline path
    const n = samples.length;
    let path = '';
    let lastX = padL;
    let lastY = padT + plotH;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? padL + plotW / 2 : padL + (plotW * i / (n - 1));
      const v = samples[i].v;
      const clamped = v < min ? min : (v > max ? max : v);
      const y = padT + plotH * (1 - (clamped - min) / range);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      lastX = x;
      lastY = y;
    }

    const latestValue = Math.round(samples[n - 1].v);
    const latestLabel = latestValue + unit;
    const latestX = Math.min(width - padR - 4, lastX + 4);
    const latestY = Math.max(padT + 8, lastY - 4);

    return '<svg class="health-trend-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-label="' + _escapeHtml(opts.label || 'chart') + ' trend, latest ' + _escapeHtml(latestLabel) + '">' +
      '<g class="health-trend-grid">' + grid.join('') + '</g>' +
      '<path class="health-trend-line ' + lineClass + '" d="' + path.trim() + '" />' +
      '<circle class="health-trend-dot ' + dotClass + '" cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2.5" />' +
      '<text class="health-trend-latest" x="' + latestX.toFixed(1) + '" y="' + latestY.toFixed(1) + '">' + _escapeHtml(latestLabel) + '</text>' +
      '</svg>';
  }

  // =====================================================
  // TREND PANEL (per device)
  // Renders zoom controls + battery / CPU line charts.
  // =====================================================
  function buildTrendPanel(deviceId) {
    const buf = getBuffer(deviceId);
    const zoomHours = zoomByDevice.get(deviceId) || 1;
    const windowMs = zoomHours * 60 * 60 * 1000;
    const safeDeviceId = _escapeHtml(deviceId);

    const windowSamples = buf.getWindow(windowMs);
    const batterySamples = windowSamples
      .map(function (s) { return s.battery !== null && s.battery !== undefined ? { t: s.t, v: s.battery } : null; })
      .filter(function (s) { return s !== null; });
    const cpuSamples = windowSamples
      .map(function (s) { return s.cpu !== null && s.cpu !== undefined ? { t: s.t, v: s.cpu } : null; })
      .filter(function (s) { return s !== null; });

    const zoomTabs = ZOOM_OPTIONS.map(function (opt) {
      const active = opt.hours === zoomHours;
      return '<button type="button" class="health-trend-tab' + (active ? ' active' : '') +
        '" data-device-id="' + safeDeviceId +
        '" data-zoom-hours="' + opt.hours +
        '" aria-pressed="' + (active ? 'true' : 'false') +
        '">' + opt.label + '</button>';
    }).join('');

    return '<div class="health-trend-panel" data-device-id="' + safeDeviceId + '">' +
      '<div class="health-trend-header">' +
        '<span class="health-trend-title">24h Trends</span>' +
        '<div class="health-trend-tabs" role="tablist" aria-label="Trend zoom window">' + zoomTabs + '</div>' +
      '</div>' +
      '<div class="health-trend-chart">' +
        '<div class="health-trend-chart-label">Battery Level</div>' +
        renderLineChart(batterySamples, {
          min: 0, max: 100, unit: '%',
          label: 'Battery',
          lineClass: 'health-trend-line-battery',
          dotClass: 'health-trend-dot-battery'
        }) +
      '</div>' +
      '<div class="health-trend-chart">' +
        '<div class="health-trend-chart-label">CPU Load</div>' +
        renderLineChart(cpuSamples, {
          min: 0, max: 100, unit: '%',
          label: 'CPU load',
          lineClass: 'health-trend-line-cpu',
          dotClass: 'health-trend-dot-cpu'
        }) +
      '</div>' +
    '</div>';
  }

  function buildCard(device, health) {
    let simState = 'UNKNOWN';
    let signalDbm = null;
    let batteryPct = null;
    let tempC = null;
    let memUsed = null;
    let memTotal = null;
    const alerts = [];

    if (health && health.sim) simState = health.sim.sim_state || 'UNKNOWN';
    if (health && health.signal) signalDbm = health.signal.signal_dbm;
    if (health && health.battery) {
      batteryPct = health.battery.level;
      tempC = health.battery.temperature;
    }
    if (health && health.memory) {
      memUsed = health.memory.used;
      memTotal = health.memory.total;
    }

    const memPct = (memUsed && memTotal) ? Math.round((memUsed / memTotal) * 100) : null;

    if (batteryPct !== null && batteryPct <= BATTERY_LOW) alerts.push('Low battery');
    if (tempC !== null && tempC >= TEMP_HIGH) alerts.push('High temperature');
    if (simState === 'ABSENT' || simState === 'UNKNOWN') alerts.push('No SIM');

    const alertHtml = alerts.length > 0
      ? '<div class="health-alerts">' + alerts.map(function (a) {
          return '<span class="health-alert-item">⚠ ' + a + '</span>';
        }).join('') + '</div>'
      : '';

    let metrics = '';
    metrics += metricRow('📶', 'SIM', badge(simState, simLevel(simState)));
    metrics += metricRow('📡', 'Signal',
      signalDbm !== null ? badge(signalDbm + ' dBm', signalLevel(signalDbm)) : badge('N/A', 'yellow'));
    metrics += metricRow('🔋', 'Battery',
      batteryPct !== null ? badge(batteryPct + '%', batteryLevel(batteryPct)) : badge('N/A', 'yellow'));
    metrics += metricRow('🌡️', 'Temperature',
      tempC !== null ? badge(tempC + '°C', tempLevel(tempC)) : badge('N/A', 'yellow'));
    metrics += metricRow('💾', 'Memory',
      memPct !== null ? badge(memPct + '%', memoryLevel(memPct)) : badge('N/A', 'yellow'));

    const deviceName = device.name || device.model || device.id || 'Unknown';
    const deviceId = device.id || '';
    const safeDeviceId = _escapeHtml(deviceId);
    const safeDeviceName = _escapeHtml(deviceName);

    return '<div class="health-card" data-device-id="' + safeDeviceId + '">' +
      '<div class="health-card-header">' +
        '<span class="health-card-name">' + safeDeviceName + '</span>' +
        '<span class="health-card-id">' + safeDeviceId + '</span>' +
      '</div>' +
      alertHtml +
      '<div class="health-metrics">' + metrics + '</div>' +
      buildTrendPanel(deviceId) +
    '</div>';
  }

  async function fetchHealth(deviceId) {
    try {
      if (window.electronAPI && window.electronAPI.getDeviceHealth) {
        return await window.electronAPI.getDeviceHealth(deviceId);
      }
    } catch (e) {
      console.warn('[HealthDashboard] fetchHealth error for', deviceId, e);
    }
    return null;
  }

  // Sample health data into the per-device ring buffer.
  // Throttled to one sample per SAMPLE_INTERVAL_MS (5 minutes) to match
  // the 5-minute slot size of the 24-hour buffer (288 slots).
  function sampleInto(deviceId, health) {
    const now = Date.now();
    const last = lastSampleAt.get(deviceId) || 0;
    if (now - last < SAMPLE_INTERVAL_MS) return;
    lastSampleAt.set(deviceId, now);

    let battery = null;
    let cpu = null;

    if (health && health.battery && typeof health.battery.level === 'number') {
      battery = health.battery.level;
    }

    // CPU load proxy: memory pressure (used / total * 100).
    // The current health:get IPC does not yet expose per-device CPU,
    // so we chart the most meaningful load indicator available.
    if (health && health.memory && health.memory.used && health.memory.total) {
      const ratio = health.memory.used / health.memory.total;
      if (isFinite(ratio) && ratio >= 0) {
        cpu = Math.max(0, Math.min(100, ratio * 100));
      }
    }

    getBuffer(deviceId).push({ t: now, battery: battery, cpu: cpu });
  }

  async function refresh() {
    if (!panelEl) return;

    try {
      if (window.electronAPI && window.electronAPI.getDevices) {
        const result = await window.electronAPI.getDevices();
        if (result && result.devices) devices = result.devices;
      }
    } catch (e) {
      console.warn('[HealthDashboard] Failed to load devices:', e);
    }

    if (devices.length === 0) {
      panelEl.innerHTML = '<div class="health-empty"><span class="health-empty-icon">📱</span><p>No devices connected</p></div>';
      return;
    }

    const cards = [];
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      const health = await fetchHealth(device.id);
      sampleInto(device.id, health);
      cards.push(buildCard(device, health));
    }

    panelEl.innerHTML = cards.join('');
  }

  // Re-render the trend panel for a single device in-place,
  // preserving the rest of the card and avoiding a full refresh.
  function rerenderTrend(deviceId) {
    if (!panelEl) return;
    const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(deviceId) : deviceId.replace(/"/g, '\\"');
    const card = panelEl.querySelector('.health-card[data-device-id="' + safeId + '"]');
    if (!card) return;
    const oldPanel = card.querySelector('.health-trend-panel');
    if (!oldPanel) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildTrendPanel(deviceId);
    const newPanel = tmp.firstChild;
    if (newPanel) {
      oldPanel.parentNode.replaceChild(newPanel, oldPanel);
    }
  }

  // Event delegation for zoom tab clicks
  function onPanelClick(e) {
    const tab = e.target.closest && e.target.closest('.health-trend-tab');
    if (!tab) return;
    const deviceId = tab.getAttribute('data-device-id');
    const hours = parseInt(tab.getAttribute('data-zoom-hours'), 10);
    if (!deviceId || isNaN(hours)) return;
    zoomByDevice.set(deviceId, hours);
    rerenderTrend(deviceId);
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function mount(containerId) {
    panelEl = document.getElementById(containerId);
    if (!panelEl) {
      console.warn('[HealthDashboard] Container not found:', containerId);
      return;
    }
    panelEl.addEventListener('click', onPanelClick);
    startAutoRefresh();
  }

  function unmount() {
    stopAutoRefresh();
    if (panelEl) {
      panelEl.removeEventListener('click', onPanelClick);
    }
    panelEl = null;
  }

  return { mount, unmount, refresh };
})();
