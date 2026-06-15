// =====================================================
// PHONE FARM V2 - CONNECTION-LOST PERSISTENT BANNER
// Shows a sticky banner when devices disconnect or ADB goes down.
// Aggregates multiple disconnected devices into one banner.
// =====================================================

window.ConnectionBanner = (function () {
  // --- State ---
  var disconnectedDevices = new Map(); // id -> device info
  var adbDown = false;
  var dismissed = false;
  var retryCount = 0;
  var retryTimerId = null;
  var bannerEl = null;
  var ipcCleanups = [];

  // --- DOM helpers ---
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getDeviceLabel(device) {
    if (!device) return 'Bilinmeyen cihaz';
    return device.customName || device.model || device.id || 'Bilinmeyen cihaz';
  }

  // --- Banner rendering ---
  function buildBanner() {
    var count = disconnectedDevices.size;
    var isAdbDown = adbDown && count === 0;

    var severity = isAdbDown ? 'critical' : 'warning';

    var wrapper = el('div', 'connection-banner connection-banner-' + severity);
    wrapper.setAttribute('role', 'alert');
    wrapper.setAttribute('aria-live', 'assertive');

    // Icon
    var icon = el('span', 'connection-banner-icon');
    icon.textContent = isAdbDown ? '\u26A0\uFE0F' : '\uD83D\uDD0C';
    wrapper.appendChild(icon);

    // Text block
    var textBlock = el('div', 'connection-banner-text');

    var title = el('strong', 'connection-banner-title');
    if (isAdbDown) {
      title.textContent = 'ADB Sunucusu \u00C7evrimd\u0131\u015F\u0131';
    } else if (count === 1) {
      var device = disconnectedDevices.values().next().value;
      title.textContent = 'Ba\u011Flant\u0131 Kesildi: ' + getDeviceLabel(device);
    } else {
      title.textContent = count + ' cihaz\u0131n ba\u011Flant\u0131s\u0131 kesildi';
    }
    textBlock.appendChild(title);

    var desc = el('span', 'connection-banner-desc');
    if (isAdbDown) {
      desc.textContent = 'ADB sunucusu yan\u0131t vermiyor \u2014 otomatik yeniden ba\u015Flat\u0131l\u0131yor...';
    } else {
      desc.textContent = 'Cihaz ba\u011Flant\u0131s\u0131 kesildi \u2014 otomatik yeniden ba\u011Flan\u0131l\u0131yor...';
    }
    textBlock.appendChild(desc);

    if (retryCount > 0) {
      var retry = el('span', 'connection-banner-retry');
      retry.textContent = 'Yeniden deneme: ' + retryCount;
      textBlock.appendChild(retry);
    }

    wrapper.appendChild(textBlock);

    // Reconnect button
    var reconnectBtn = el('button', 'connection-banner-btn', 'Yeniden Ba\u011Flan');
    reconnectBtn.type = 'button';
    reconnectBtn.addEventListener('click', function () {
      retryCount = 0;
      if (window.electronAPI && typeof window.electronAPI.refreshDevices === 'function') {
        window.electronAPI.refreshDevices();
      }
    });
    wrapper.appendChild(reconnectBtn);

    // Dismiss button
    var dismissBtn = el('button', 'connection-banner-dismiss', '\u00D7');
    dismissBtn.type = 'button';
    dismissBtn.setAttribute('aria-label', 'Kapat');
    dismissBtn.addEventListener('click', function () {
      dismissed = true;
      render();
    });
    wrapper.appendChild(dismissBtn);

    return wrapper;
  }

  function render() {
    var hasDisconnected = disconnectedDevices.size > 0;
    var shouldShow = (hasDisconnected || adbDown) && !dismissed;

    if (shouldShow) {
      var newBanner = buildBanner();
      if (bannerEl && bannerEl.parentNode) {
        bannerEl.parentNode.replaceChild(newBanner, bannerEl);
      } else {
        document.body.insertBefore(newBanner, document.body.firstChild);
      }
      bannerEl = newBanner;
    } else {
      if (bannerEl && bannerEl.parentNode) {
        bannerEl.parentNode.removeChild(bannerEl);
      }
      bannerEl = null;
    }
  }

  // --- Retry counter ---
  function startRetryCounter() {
    stopRetryCounter();
    retryCount = 0;
    retryTimerId = setInterval(function () {
      retryCount++;
      render();
    }, 5000);
  }

  function stopRetryCounter() {
    if (retryTimerId) {
      clearInterval(retryTimerId);
      retryTimerId = null;
    }
    retryCount = 0;
  }

  // --- Public API ---
  function init() {
    if (!window.electronAPI) return;

    // Device disconnected
    if (typeof window.electronAPI.onDeviceDisconnected === 'function') {
      var cleanupDisconnect = window.electronAPI.onDeviceDisconnected(function (device) {
        if (device && device.id) {
          disconnectedDevices.set(device.id, device);
          dismissed = false;
          startRetryCounter();
          render();
        }
      });
      if (typeof cleanupDisconnect === 'function') {
        ipcCleanups.push(cleanupDisconnect);
      }
    }

    // Device connected (restored)
    if (typeof window.electronAPI.onDeviceConnected === 'function') {
      var cleanupConnect = window.electronAPI.onDeviceConnected(function (device) {
        if (device && device.id) {
          disconnectedDevices.delete(device.id);
          if (disconnectedDevices.size === 0) {
            stopRetryCounter();
          }
          render();
        }
      });
      if (typeof cleanupConnect === 'function') {
        ipcCleanups.push(cleanupConnect);
      }
    }

    // Devices updated (full list sync)
    if (typeof window.electronAPI.onDevicesUpdated === 'function') {
      var cleanupUpdated = window.electronAPI.onDevicesUpdated(function (devices) {
        if (!Array.isArray(devices)) return;
        var connectedIds = new Set(devices.map(function (d) { return d.id; }));
        var changed = false;
        disconnectedDevices.forEach(function (_v, id) {
          if (connectedIds.has(id)) {
            disconnectedDevices.delete(id);
            changed = true;
          }
        });
        if (changed && disconnectedDevices.size === 0) {
          stopRetryCounter();
        }
        if (changed) render();
      });
      if (typeof cleanupUpdated === 'function') {
        ipcCleanups.push(cleanupUpdated);
      }
    }

    // Health critical (ADB down)
    if (typeof window.electronAPI.onHealthCritical === 'function') {
      var cleanupHealth = window.electronAPI.onHealthCritical(function (alerts) {
        var adbAlert = Array.isArray(alerts) && alerts.some(function (a) {
          return typeof a === 'string' && a.toLowerCase().indexOf('adb') !== -1;
        });
        if (adbAlert) {
          adbDown = true;
          dismissed = false;
          startRetryCounter();
        } else {
          adbDown = false;
          if (disconnectedDevices.size === 0) stopRetryCounter();
        }
        render();
      });
      if (typeof cleanupHealth === 'function') {
        ipcCleanups.push(cleanupHealth);
      }
    }
  }

  function show(device) {
    if (device && device.id) {
      disconnectedDevices.set(device.id, device);
    }
    dismissed = false;
    startRetryCounter();
    render();
  }

  function hide() {
    disconnectedDevices.clear();
    adbDown = false;
    dismissed = false;
    stopRetryCounter();
    render();
  }

  function setAdbDown(down) {
    adbDown = !!down;
    if (adbDown) {
      dismissed = false;
      startRetryCounter();
    } else if (disconnectedDevices.size === 0) {
      stopRetryCounter();
    }
    render();
  }

  function dismiss() {
    dismissed = true;
    render();
  }

  function destroy() {
    stopRetryCounter();
    ipcCleanups.forEach(function (fn) {
      try { fn(); } catch (_e) { /* ignore */ }
    });
    ipcCleanups = [];
    if (bannerEl && bannerEl.parentNode) {
      bannerEl.parentNode.removeChild(bannerEl);
    }
    bannerEl = null;
    disconnectedDevices.clear();
    adbDown = false;
    dismissed = false;
  }

  // For testing: expose internal state readers
  function getDisconnectedCount() {
    return disconnectedDevices.size;
  }

  function isAdbDown() {
    return adbDown;
  }

  function isDismissed() {
    return dismissed;
  }

  function isVisible() {
    return bannerEl !== null && bannerEl.parentNode !== null;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    dismiss: dismiss,
    destroy: destroy,
    setAdbDown: setAdbDown,
    getDisconnectedCount: getDisconnectedCount,
    isAdbDown: isAdbDown,
    isDismissed: isDismissed,
    isVisible: isVisible
  };
})();
