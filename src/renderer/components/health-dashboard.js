// =====================================================
// PHONE FARM V2 - HEALTH DASHBOARD PANEL
// Device health monitoring with auto-refresh
// =====================================================

function _escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.HealthDashboard = (function () {
  const REFRESH_INTERVAL = 30000;
  const BATTERY_LOW = 15;
  const TEMP_HIGH = 50;
  const SIGNAL_WEAK = -100;

  let refreshTimer = null;
  let panelEl = null;
  let devices = [];

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

  function buildCard(device, health) {
    var simState = 'UNKNOWN';
    var signalDbm = null;
    var batteryPct = null;
    var tempC = null;
    var memUsed = null;
    var memTotal = null;
    var alerts = [];

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

    var memPct = (memUsed && memTotal) ? Math.round((memUsed / memTotal) * 100) : null;

    if (batteryPct !== null && batteryPct <= BATTERY_LOW) alerts.push('Low battery');
    if (tempC !== null && tempC >= TEMP_HIGH) alerts.push('High temperature');
    if (simState === 'ABSENT' || simState === 'UNKNOWN') alerts.push('No SIM');

    var alertHtml = alerts.length > 0
      ? '<div class="health-alerts">' + alerts.map(function (a) {
          return '<span class="health-alert-item">⚠ ' + a + '</span>';
        }).join('') + '</div>'
      : '';

    var metrics = '';
    metrics += metricRow('📶', 'SIM', badge(simState, simLevel(simState)));
    metrics += metricRow('📡', 'Signal',
      signalDbm !== null ? badge(signalDbm + ' dBm', signalLevel(signalDbm)) : badge('N/A', 'yellow'));
    metrics += metricRow('🔋', 'Battery',
      batteryPct !== null ? badge(batteryPct + '%', batteryLevel(batteryPct)) : badge('N/A', 'yellow'));
    metrics += metricRow('🌡️', 'Temperature',
      tempC !== null ? badge(tempC + '°C', tempLevel(tempC)) : badge('N/A', 'yellow'));
    metrics += metricRow('💾', 'Memory',
      memPct !== null ? badge(memPct + '%', memoryLevel(memPct)) : badge('N/A', 'yellow'));

    var deviceName = device.name || device.model || device.id || 'Unknown';
    var deviceId = device.id || '';

    return '<div class="health-card" data-device-id="' + _escapeHtml(deviceId) + '">' +
      '<div class="health-card-header">' +
        '<span class="health-card-name">' + _escapeHtml(deviceName) + '</span>' +
        '<span class="health-card-id">' + _escapeHtml(deviceId) + '</span>' +
      '</div>' +
      alertHtml +
      '<div class="health-metrics">' + metrics + '</div>' +
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

  async function refresh() {
    if (!panelEl) return;

    try {
      if (window.electronAPI && window.electronAPI.getDevices) {
        var result = await window.electronAPI.getDevices();
        if (result && result.devices) devices = result.devices;
      }
    } catch (e) {
      console.warn('[HealthDashboard] Failed to load devices:', e);
    }

    if (devices.length === 0) {
      panelEl.innerHTML = '<div class="health-empty"><span class="health-empty-icon">📱</span><p>No devices connected</p></div>';
      return;
    }

    var cards = [];
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i];
      var health = await fetchHealth(device.id);
      cards.push(buildCard(device, health));
    }

    panelEl.innerHTML = cards.join('');
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
    startAutoRefresh();
  }

  function unmount() {
    stopAutoRefresh();
    panelEl = null;
  }

  return { mount, unmount, refresh };
})();
