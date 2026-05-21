// =====================================================
// PHONE FARM V2 - HOME MODE RENDERER
// =====================================================

// State
let devices = [];
let isRunning = false;
let activeDevices = new Set();
let editingDeviceId = null;
let selectedEmoji = '';
let selectedColor = '';
let selectedDeviceIndex = -1;
let groups = [];
let licenseInfo = null;
let _lastDeviceScan = 0;

// DOM Elements
const elements = {
  // Back button
  btnBack: document.getElementById('btn-back'),

  // Control Panel
  controlTitle: document.getElementById('control-title'),
  controlDescription: document.getElementById('control-description'),
  btnStart: document.getElementById('btn-start'),
  btnStop: document.getElementById('btn-stop'),

  // Devices
  devicesList: document.getElementById('devices-list'),
  devicesGrid: document.getElementById('devices-grid'),
  devicesEmpty: document.getElementById('devices-empty'),
  deviceCount: document.getElementById('device-count'),
  btnRefreshDevices: document.getElementById('btn-refresh-devices'),
  btnScanDevices: document.getElementById('btn-scan-devices'),

  // Status
  tailscaleStatus: document.getElementById('tailscale-status'),
  parsecStatus: document.getElementById('parsec-status'),
  scrcpyStatus: document.getElementById('scrcpy-status'),
  toggleAutostart: document.getElementById('toggle-autostart'),
  btnRefreshStatus: document.getElementById('btn-refresh-status'),

  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  btnSettings: document.getElementById('btn-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  settingMaxSize: document.getElementById('setting-max-size'),
  settingMaxFps: document.getElementById('setting-max-fps'),
  settingBitrate: document.getElementById('setting-bitrate'),
  settingBorderless: document.getElementById('setting-borderless'),
  settingAlwaysOnTop: document.getElementById('setting-always-on-top'),

  // Device Edit Modal
  deviceEditModal: document.getElementById('device-edit-modal'),
  deviceEditTitle: document.getElementById('device-edit-title'),
  btnCloseDeviceEdit: document.getElementById('btn-close-device-edit'),
  deviceNameInput: document.getElementById('device-name-input'),
  emojiPicker: document.getElementById('emoji-picker'),
  colorPicker: document.getElementById('color-picker'),
  deviceGroupSelect: document.getElementById('device-group-select'),
  btnResetDevice: document.getElementById('btn-reset-device'),
  btnSaveDevice: document.getElementById('btn-save-device'),

  // Text Input Modal
  textInputModal: document.getElementById('text-input-modal'),
  textModalTitle: document.getElementById('text-modal-title'),
  textInputField: document.getElementById('text-input-field'),
  btnCloseTextModal: document.getElementById('btn-close-text-modal'),
  btnSendText: document.getElementById('btn-send-text'),
  btnSendEnter: document.getElementById('btn-send-enter'),
  btnSendBackspace: document.getElementById('btn-send-backspace'),
  textSendStatus: document.getElementById('text-send-status'),

  // Shortcuts Modal
  shortcutsModal: document.getElementById('shortcuts-modal'),
  btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),
  shortcutList: document.getElementById('shortcut-list'),

  // Other
  btnMinimize: document.getElementById('btn-minimize'),
  btnAbout: document.getElementById('btn-about')
};

// =====================================================
// BACK NAVIGATION
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: BACK NAVIGATION ===== */

elements.btnBack.addEventListener('click', async () => {
  try {
    await window.electronAPI.goBack();
  } catch (e) {
    console.error('Go back error:', e);
  }
});

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: KEYBOARD SHORTCUTS ===== */

document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const key = e.key.toLowerCase();

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    if (key === 'escape') document.activeElement.blur();
    return;
  }

  if (ctrl && !shift && key >= '1' && key <= '9') {
    e.preventDefault();
    selectDeviceByIndex(parseInt(key) - 1);
    return;
  }

  if (ctrl && !shift && key === 'a') {
    e.preventDefault();
    openAllWindows();
    return;
  }

  if (ctrl && !shift && key === 'w') {
    e.preventDefault();
    closeSelectedWindow();
    return;
  }

  if (ctrl && shift && key === 'w') {
    e.preventDefault();
    closeAllWindows();
    return;
  }

  if ((ctrl && key === 'r') || key === 'f5') {
    e.preventDefault();
    refreshDevicesWithMerge();
    return;
  }

  if (ctrl && !shift && key === 's') {
    e.preventDefault();
    toggleFarm();
    return;
  }

  if (ctrl && key === ',') {
    e.preventDefault();
    openSettings();
    return;
  }

  if (key === '?' || (shift && key === '/')) {
    e.preventDefault();
    showShortcuts();
    return;
  }

  if (key === 'escape') {
    closeAllModals();
    return;
  }
});

// =====================================================
// SHORTCUT HELPER FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: SHORTCUT HELPER FUNCTIONS ===== */

function selectDeviceByIndex(index) {
  if (devices[index]) {
    selectedDeviceIndex = index;
    highlightDevice(index);
    if (isRunning) {
      try {
        window.electronAPI.scrcpyStartDevice(devices[index].id);
      } catch (e) {
        console.error('Select device start error:', e);
      }
    }
  }
}

function highlightDevice(index) {
  document.querySelectorAll('.device-card').forEach(card => card.classList.remove('selected'));
  const cards = document.querySelectorAll('.device-card');
  if (cards[index]) {
    cards[index].classList.add('selected');
    cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function openAllWindows() {
  try {
    if (!isRunning) {
      await startAll();
    } else {
      await window.electronAPI.scrcpyStartAll();
    }
  } catch (e) {
    console.error('Open all windows error:', e);
  }
}

async function closeSelectedWindow() {
  try {
    if (selectedDeviceIndex >= 0 && devices[selectedDeviceIndex]) {
      await window.electronAPI.scrcpyStopDevice(devices[selectedDeviceIndex].id);
    }
  } catch (e) {
    console.error('Close selected window error:', e);
  }
}

async function closeAllWindows() {
  try {
    await window.electronAPI.scrcpyStopAll();
  } catch (e) {
    console.error('Close all windows error:', e);
  }
}

async function toggleFarm() {
  if (isRunning) {
    await stopAll();
  } else {
    await startAll();
  }
}

function closeAllModals() {
  elements.settingsModal?.classList.add('hidden');
  elements.deviceEditModal?.classList.add('hidden');
  elements.shortcutsModal?.classList.add('hidden');
  elements.textInputModal?.classList.add('hidden');
}

async function showShortcuts() {
  try {
    const shortcuts = await window.electronAPI.getShortcuts();
    elements.shortcutList.innerHTML = shortcuts.map(s => `
      <div class="shortcut-item">
        <span class="shortcut-key">${s.key}</span>
        <span class="shortcut-action">${s.action}</span>
      </div>
    `).join('');
    elements.shortcutsModal.classList.remove('hidden');
  } catch (e) {
    console.error('Show shortcuts error:', e);
  }
}

// =====================================================
// DEVICE FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: DEVICE FUNCTIONS ===== */

async function refreshDevicesWithMerge() {
  if (Date.now() - _lastDeviceScan < 5000) return;
  _lastDeviceScan = Date.now();

  if (typeof process !== 'undefined') console.log('[Renderer] refreshDevicesWithMerge called');
  try {
    const mergedDevices = await window.electronAPI.getMergedDevices();
    if (typeof process !== 'undefined') console.log('[Renderer] getMergedDevices result:', mergedDevices);
    if (typeof process !== 'undefined') console.log('[Renderer] Devices count:', mergedDevices ? mergedDevices.length : 0);
    if (mergedDevices && Array.isArray(mergedDevices)) {
      devices = mergedDevices;
    } else {
      devices = [];
    }
    updateDevicesUI();
  } catch (e) {
    console.error('[Renderer] refreshDevicesWithMerge error:', e);
    await refreshDevices();
  }
}

async function refreshDevices() {
  if (typeof process !== 'undefined') console.log('[Renderer] refreshDevices called');
  try {
    const result = await window.electronAPI.refreshDevices();
    if (typeof process !== 'undefined') console.log('[Renderer] refreshDevices result:', result);
    if (result && result.success) {
      devices = result.devices || [];
      if (typeof process !== 'undefined') console.log('[Renderer] Devices loaded:', devices.length);
      updateDevicesUI();
    } else {
      console.error('[Renderer] refreshDevices failed:', result.error);
    }
  } catch (e) {
    console.error('[Renderer] refreshDevices error:', e);
  }
}

function updateDevicesUI() {
  const count = devices.length;
  elements.deviceCount.textContent = `${count} telefon`;
  updateDevicesList();

  if (count === 0) {
    elements.devicesGrid.classList.add('hidden');
    elements.devicesEmpty.classList.remove('hidden');
    elements.deviceCount.className = 'status-badge status-warning';
  } else {
    elements.devicesGrid.classList.remove('hidden');
    elements.devicesEmpty.classList.add('hidden');
    elements.deviceCount.className = 'status-badge status-online';
    renderDeviceCards();
  }
}

function updateDevicesList() {
  const count = devices.length;

  if (count === 0) {
    elements.devicesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📱</div>
        <h3>Telefon Bekleniyor</h3>
        <p>USB ile telefon baglayin ve USB hata ayiklama modunu acin.</p>
      </div>
    `;
  } else {
    let html = '<div class="connected-devices-list">';
    for (const device of devices) {
      if (!device) continue;
      const isActive = activeDevices.has(device.id);
      const displayName = device.customName || device.model;
      const emoji = device.emoji || '📱';
      const statusClass = isActive ? 'status-online' : 'status-unknown';
      const statusText = isActive ? 'Aktif' : 'Bagli';

      html += `
        <div class="connected-device-item ${isActive ? 'active' : ''}">
          <span class="device-emoji">${emoji}</span>
          <div class="device-info-compact">
            <span class="device-name-compact">${escapeHtml(displayName)}</span>
            <span class="device-battery-compact">${getBatteryIcon(device.battery)} ${device.battery ?? '?'}%</span>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
      `;
    }
    html += '</div>';
    elements.devicesList.innerHTML = html;
  }
}

function renderDeviceCards() {
  let html = '';

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    if (!device) continue;
    const isActive = activeDevices.has(device.id);
    const isSelected = selectedDeviceIndex === i;

    let cardClasses = ['device-card'];
    if (isActive) cardClasses.push('active');
    if (isSelected) cardClasses.push('selected');
    if (device.color) cardClasses.push('has-color');

    const colorStyle = device.color ? `border-left: 4px solid ${device.color}` : '';
    const batteryIcon = getBatteryIcon(device.battery);
    const batteryLevel = device.battery;
    const batteryClass = batteryLevel == null
      ? ''
      : (batteryLevel < 20 ? 'text-error' : (batteryLevel < 50 ? 'text-warning' : ''));
    const displayName = device.customName || device.model;
    const emoji = device.emoji || '';
    const originalName = device.customName ? device.model : '';

    html += `
      <div class="${cardClasses.join(' ')}" data-device-id="${device.id}" data-index="${i}" style="${colorStyle}">
        <span class="edit-hint">Cift tikla: Duzenle</span>
        <div class="device-header">
          <span class="device-icon">${emoji || '📱'}</span>
          <span class="status-badge ${isActive ? 'status-online' : 'status-unknown'}">
            ${isActive ? 'Aktif' : 'Hazir'}
          </span>
        </div>
        <div class="device-name">${escapeHtml(displayName)}</div>
        ${originalName ? `<div class="device-id">${escapeHtml(originalName)}</div>` : ''}
        <div class="device-id">${escapeHtml(device.id)}</div>
        <div class="device-info">
          <span class="device-info-item ${batteryClass}">${batteryIcon} ${device.battery ?? '?'}%</span>
          <span class="device-info-item">${device.screenSize?.width || '?'}x${device.screenSize?.height || '?'}</span>
        </div>
        <div class="device-actions">
          ${isActive
            ? `<button class="btn btn-sm btn-danger btn-block device-stop-btn" data-device-id="${device.id}">Durdur</button>`
            : `<button class="btn btn-sm btn-primary btn-block device-start-btn" data-device-id="${device.id}">Baslat</button>`
          }
          <button class="btn btn-sm device-text-btn device-send-text-btn" data-device-id="${device.id}" title="Metin Gonder">Metin</button>
        </div>
      </div>
    `;
  }

  elements.devicesGrid.innerHTML = html;

  // Event listeners
  document.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      selectDeviceByIndex(parseInt(card.dataset.index));
    });

    card.addEventListener('dblclick', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      openDeviceEdit(card.dataset.deviceId);
    });
  });

  document.querySelectorAll('.device-start-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startDevice(btn.dataset.deviceId);
    });
  });

  document.querySelectorAll('.device-stop-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopDevice(btn.dataset.deviceId);
    });
  });

  document.querySelectorAll('.device-send-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTextModal(btn.dataset.deviceId);
    });
  });
}

function getBatteryIcon(level) {
  if (level === null || level === undefined) return '🔋';
  if (level >= 80) return '🔋';
  if (level >= 50) return '🔋';
  if (level >= 20) return '🪫';
  return '🪫';
}

async function startDevice(deviceId) {
  try {
    // Check phone limit
    const limitCheck = await window.electronAPI.canAddPhone(activeDevices.size);
    if (!limitCheck) {
      alert('Telefon limiti kontrol edilemedi');
      return;
    }
    if (!limitCheck.allowed) {
      alert(limitCheck.reason || 'Telefon limiti asildi');
      return;
    }

    const result = await window.electronAPI.scrcpyStartDevice(deviceId);
    if (result && result.success) {
      activeDevices.add(deviceId);
      renderDeviceCards();
      updateControlPanel();
      await window.electronAPI.setFarmRunning(true);
    } else {
      alert('Cihaz baslatilamadi: ' + (result?.error || 'Bilinmeyen hata'));
    }
  } catch (e) {
    console.error('Start device error:', e);
    alert('Cihaz baslatilamadi: ' + (e?.message || String(e)));
  }
}

async function stopDevice(deviceId) {
  try {
    const result = await window.electronAPI.scrcpyStopDevice(deviceId);
    if (result && result.success) {
      activeDevices.delete(deviceId);
      renderDeviceCards();
      updateControlPanel();
      if (activeDevices.size === 0) {
        await window.electronAPI.setFarmRunning(false);
      }
    }
  } catch (e) {
    console.error('Stop device error:', e);
  }
}

// =====================================================
// DEVICE EDIT MODAL
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: DEVICE EDIT MODAL ===== */

async function openDeviceEdit(deviceId) {
  editingDeviceId = deviceId;
  const device = devices.find(d => d.id === deviceId);
  if (!device) return;

  await loadGroups();

  elements.deviceEditTitle.textContent = `${device.emoji || '📱'} ${device.customName || device.model}`;
  elements.deviceNameInput.value = device.customName || '';

  selectedEmoji = device.emoji || '';
  document.querySelectorAll('#emoji-picker .emoji-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.emoji === selectedEmoji);
  });

  selectedColor = device.color || '';
  document.querySelectorAll('#color-picker .color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === selectedColor);
  });

  elements.deviceGroupSelect.value = device.group || 'Varsayilan';
  elements.deviceEditModal.classList.remove('hidden');
  elements.deviceNameInput.focus();
}

async function loadGroups() {
  try {
    groups = await window.electronAPI.getGroups();
    if (!Array.isArray(groups)) groups = ['Varsayilan'];
    elements.deviceGroupSelect.innerHTML = groups.map(g =>
      `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`
    ).join('');
  } catch (e) {
    console.error('Load groups error:', e);
    groups = ['Varsayilan'];
    elements.deviceGroupSelect.innerHTML = '<option value="Varsayilan">Varsayilan</option>';
  }
}

async function saveDeviceEdit() {
  if (!editingDeviceId) return;

  const data = {
    customName: elements.deviceNameInput.value.trim() || null,
    emoji: selectedEmoji || null,
    color: selectedColor || null,
    group: elements.deviceGroupSelect.value || 'Varsayilan'
  };

  try {
    await window.electronAPI.saveDeviceData(editingDeviceId, data);
    closeDeviceEdit();
    await refreshDevicesWithMerge();
  } catch (e) {
    console.error('Save device error:', e);
    alert('Cihaz kaydedilemedi: ' + (e?.message || String(e)));
  }
}

async function resetDeviceEdit() {
  if (!editingDeviceId) return;

  if (confirm('Bu cihazin tum ozel ayarlarini sifirlamak istediginize emin misiniz?')) {
    try {
      await window.electronAPI.deleteDeviceData(editingDeviceId);
      closeDeviceEdit();
      await refreshDevicesWithMerge();
    } catch (e) {
      console.error('Reset device error:', e);
    }
  }
}

function closeDeviceEdit() {
  elements.deviceEditModal.classList.add('hidden');
  editingDeviceId = null;
}

// Emoji picker
document.querySelectorAll('#emoji-picker .emoji-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedEmoji = btn.dataset.emoji;
    document.querySelectorAll('#emoji-picker .emoji-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Color picker
document.querySelectorAll('#color-picker .color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedColor = btn.dataset.color;
    document.querySelectorAll('#color-picker .color-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// =====================================================
// TEXT INPUT MODAL FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: TEXT INPUT MODAL FUNCTIONS ===== */

let textModalDeviceId = null;

function openTextModal(deviceId) {
  textModalDeviceId = deviceId;
  const device = devices.find(d => d.id === deviceId);
  const displayName = device ? (device.customName || device.model) : deviceId;
  elements.textModalTitle.textContent = `Metin Gonder - ${displayName}`;
  elements.textInputField.value = '';
  elements.textSendStatus.classList.add('hidden');
  elements.textInputModal.classList.remove('hidden');
  elements.textInputField.focus();
}

function closeTextModal() {
  elements.textInputModal.classList.add('hidden');
  textModalDeviceId = null;
}

function showTextStatus(message, isError) {
  elements.textSendStatus.textContent = message;
  elements.textSendStatus.className = `text-send-status ${isError ? 'error' : 'success'}`;
  elements.textSendStatus.classList.remove('hidden');
  setTimeout(() => elements.textSendStatus.classList.add('hidden'), 3000);
}

async function sendText() {
  if (!textModalDeviceId) return;
  const text = elements.textInputField.value;
  if (!text) return;

  try {
    const result = await window.electronAPI.sendTextToDevice(textModalDeviceId, text);
    if (result && result.success) {
      showTextStatus('Metin gonderildi!', false);
      elements.textInputField.value = '';
      elements.textInputField.focus();
    } else {
      showTextStatus('Hata: ' + (result?.error || 'Gonderilemedi'), true);
    }
  } catch (e) {
    console.error('Send text error:', e);
    showTextStatus('Hata: ' + (e?.message || String(e)), true);
  }
}

async function sendEnterKey() {
  if (!textModalDeviceId) return;
  try {
    const result = await window.electronAPI.sendKeyToDevice(textModalDeviceId, 66); // KEYCODE_ENTER
    if (result && result.success) {
      showTextStatus('Enter gonderildi!', false);
    } else {
      showTextStatus('Hata: ' + (result?.error || 'Gonderilemedi'), true);
    }
  } catch (e) {
    console.error('Send enter error:', e);
    showTextStatus('Hata: ' + (e?.message || String(e)), true);
  }
}

async function sendBackspace() {
  if (!textModalDeviceId) return;
  try {
    const result = await window.electronAPI.sendKeyToDevice(textModalDeviceId, 67); // KEYCODE_DEL
    if (result && result.success) {
      showTextStatus('Silme tusu gonderildi!', false);
    } else {
      showTextStatus('Hata: ' + (result?.error || 'Gonderilemedi'), true);
    }
  } catch (e) {
    console.error('Send backspace error:', e);
    showTextStatus('Hata: ' + (e?.message || String(e)), true);
  }
}

// =====================================================
// CONTROL PANEL FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: CONTROL PANEL FUNCTIONS ===== */

function updateControlPanel() {
  isRunning = activeDevices.size > 0;

  if (isRunning) {
    elements.controlTitle.textContent = `${activeDevices.size} Telefon Aktif`;
    elements.controlDescription.textContent = 'Telefonlar ekranda gosteriliyor. Durdurmak icin asagidaki dugmeyi kullanin.';
    elements.btnStart.disabled = true;
    elements.btnStop.disabled = false;
  } else {
    elements.controlTitle.textContent = 'Telefon Kontrolu';
    elements.controlDescription.textContent = 'Telefonlari gostermek icin Baslat dugmesine tiklayin.';
    elements.btnStart.disabled = devices.length === 0;
    elements.btnStop.disabled = true;
  }

  elements.scrcpyStatus.textContent = `${activeDevices.size} aktif`;
}

async function startAll() {
  elements.btnStart.disabled = true;
  elements.btnStart.innerHTML = '<span class="spinner"></span><span>Baslatiliyor...</span>';

  try {
    // Check phone limit - will we exceed the limit?
    const maxPhones = licenseInfo?.maxPhones || 5;
    if (devices.length > maxPhones) {
      alert(`Telefon limiti asilacak! Maksimum ${maxPhones} telefon baslatabilirsiniz. Bagli telefon sayisi: ${devices.length}`);
      elements.btnStart.innerHTML = '<span>▶️</span><span>BASLAT</span>';
      elements.btnStart.disabled = false;
      return;
    }

    const result = await window.electronAPI.scrcpyStartAll();
    if (result && result.success && result.results) {
      for (const r of result.results) {
        if (r && r.success) activeDevices.add(r.deviceId);
      }
      renderDeviceCards();
      updateControlPanel();
      await window.electronAPI.setFarmRunning(true);
    } else {
      alert('Baslatilamadi: ' + (result?.error || 'Bilinmeyen hata'));
    }
  } catch (e) {
    console.error('Start all error:', e);
    alert('Baslatilamadi: ' + (e?.message || String(e)));
  } finally {
    elements.btnStart.innerHTML = '<span>▶️</span><span>BASLAT</span>';
    elements.btnStart.disabled = devices.length === 0 || isRunning;
  }
}

async function stopAll() {
  elements.btnStop.disabled = true;
  elements.btnStop.innerHTML = '<span class="spinner"></span><span>Durduruluyor...</span>';

  try {
    await window.electronAPI.scrcpyStopAll();
    activeDevices.clear();
    renderDeviceCards();
    updateControlPanel();
    await window.electronAPI.setFarmRunning(false);
  } catch (e) {
    console.error('Stop all error:', e);
  } finally {
    elements.btnStop.innerHTML = '<span>⏹️</span><span>DURDUR</span>';
  }
}

// =====================================================
// STATUS FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: STATUS FUNCTIONS ===== */

async function refreshStatus() {
  try {
    const status = await window.electronAPI.getFullStatus();
    if (!status || !status.success) return;

    // Tailscale
    if (status.tailscale.loggedIn) {
      elements.tailscaleStatus.innerHTML = `
        <span class="status-badge status-online">Bagli</span>
        <span class="text-muted" style="font-size: 0.8rem; margin-left: 8px;">${status.tailscale.ip || ''}</span>
      `;
    } else if (status.tailscale.running) {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-warning">Giris Gerekli</span>';
    } else if (status.tailscale.installed) {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-warning">Calismiyor</span>';
    } else {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-offline">Kurulu Degil</span>';
    }

    // Parsec
    if (status.parsec.loggedIn) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-online">Hazir</span>';
    } else if (status.parsec.running) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-warning">Giris Gerekli</span>';
    } else if (status.parsec.installed) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-warning">Calismiyor</span>';
    } else {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-offline">Kurulu Degil</span>';
    }

    // Scrcpy
    activeDevices = new Set(status.scrcpy.activeDevices || []);
    elements.scrcpyStatus.textContent = `${activeDevices.size} aktif`;

    // Autostart
    elements.toggleAutostart.checked = status.autostart.enabled;

    updateControlPanel();
  } catch (e) {
    console.error('Refresh status error:', e);
  }
}

// =====================================================
// SETTINGS FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: SETTINGS FUNCTIONS ===== */

function openSettings() {
  elements.settingsModal.classList.remove('hidden');
  loadSettings();
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden');
}

async function loadSettings() {
  try {
    const options = await window.electronAPI.scrcpyGetOptions();
    if (!options) return;
    elements.settingMaxSize.value = options.maxSize || '800';
    elements.settingMaxFps.value = options.maxFps || '30';
    elements.settingBitrate.value = options.bitrate || '2M';
    elements.settingBorderless.checked = options.borderless || false;
    elements.settingAlwaysOnTop.checked = options.alwaysOnTop || false;
  } catch (e) {
    console.error('Load settings error:', e);
  }
}

async function saveSettings() {
  const options = {
    maxSize: parseInt(elements.settingMaxSize.value),
    maxFps: parseInt(elements.settingMaxFps.value),
    bitrate: elements.settingBitrate.value,
    borderless: elements.settingBorderless.checked,
    alwaysOnTop: elements.settingAlwaysOnTop.checked
  };

  try {
    await window.electronAPI.scrcpySetOptions(options);
    closeSettings();
  } catch (e) {
    console.error('Save settings error:', e);
    alert('Ayarlar kaydedilemedi: ' + (e?.message || String(e)));
  }
}

// Autostart toggle
async function toggleAutostart() {
  try {
    const result = await window.electronAPI.autostartToggle();
    if (!result || !result.success) {
      elements.toggleAutostart.checked = !elements.toggleAutostart.checked;
    }
  } catch (e) {
    console.error('Toggle autostart error:', e);
    elements.toggleAutostart.checked = !elements.toggleAutostart.checked;
  }
}

// =====================================================
// EVENT LISTENERS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: EVENT LISTENERS ===== */

elements.btnStart.addEventListener('click', startAll);
elements.btnStop.addEventListener('click', stopAll);
elements.btnRefreshDevices.addEventListener('click', refreshDevicesWithMerge);
elements.btnScanDevices?.addEventListener('click', refreshDevicesWithMerge);
elements.btnRefreshStatus.addEventListener('click', refreshStatus);
elements.btnSettings.addEventListener('click', openSettings);
elements.btnCloseSettings.addEventListener('click', closeSettings);
elements.btnSaveSettings.addEventListener('click', saveSettings);
elements.btnCloseDeviceEdit.addEventListener('click', closeDeviceEdit);
elements.btnSaveDevice.addEventListener('click', saveDeviceEdit);
elements.btnResetDevice.addEventListener('click', resetDeviceEdit);
elements.btnCloseShortcuts?.addEventListener('click', () => elements.shortcutsModal.classList.add('hidden'));

// Text Input Modal events
elements.btnCloseTextModal?.addEventListener('click', closeTextModal);
elements.btnSendText?.addEventListener('click', sendText);
elements.btnSendEnter?.addEventListener('click', sendEnterKey);
elements.btnSendBackspace?.addEventListener('click', sendBackspace);
elements.textInputField?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendText();
  }
});
elements.toggleAutostart.addEventListener('change', toggleAutostart);
elements.btnMinimize.addEventListener('click', async () => {
  try {
    await window.electronAPI.minimizeWindow();
  } catch (e) {
    console.error('Minimize window error:', e);
  }
});
elements.btnAbout?.addEventListener('click', async () => {
  try {
    await window.electronAPI.openAbout();
  } catch (e) {
    console.error('Open about error:', e);
  }
});

// Modal close on outside click
[elements.settingsModal, elements.deviceEditModal, elements.shortcutsModal, elements.textInputModal].forEach(modal => {
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }
});

// =====================================================
// IPC EVENT LISTENERS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: IPC EVENT LISTENERS ===== */

window.electronAPI.onDevicesUpdated((updatedDevices) => refreshDevicesWithMerge());
window.electronAPI.onDeviceConnected((device) => refreshDevicesWithMerge());
window.electronAPI.onDeviceDisconnected((device) => {
  activeDevices.delete(device.id);
  refreshDevicesWithMerge();
});

window.electronAPI.onScrcpyWindowStarted((data) => {
  activeDevices.add(data.deviceId);
  renderDeviceCards();
  updateControlPanel();
});

window.electronAPI.onScrcpyWindowClosed((data) => {
  activeDevices.delete(data.deviceId);
  renderDeviceCards();
  updateControlPanel();
});

window.electronAPI.onScrcpyWindowError((data) => {
  activeDevices.delete(data.deviceId);
  renderDeviceCards();
  updateControlPanel();
});

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: UTILITY FUNCTIONS ===== */

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =====================================================
// INITIALIZATION
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: INITIALIZATION ===== */

async function loadLicenseInfo() {
  try {
    licenseInfo = await window.electronAPI.getLicenseInfo();
    if (typeof process !== 'undefined') console.log('[Renderer] License info:', licenseInfo);
  } catch (e) {
    console.error('[Renderer] License info error:', e);
  }
}

async function init() {
  if (typeof process !== 'undefined') console.log('[Renderer] Initializing home mode...');

  // Load license info first
  await loadLicenseInfo();

  await refreshDevicesWithMerge();
  await refreshStatus();

  setInterval(async () => {
    await refreshStatus();
    await refreshDevicesWithMerge();
  }, 10000);

  if (typeof process !== 'undefined') console.log('[Renderer] Home mode initialized');
}

init();
