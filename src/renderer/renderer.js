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

// Elements
const elements = {
  btnBack: document.getElementById('btn-back'),
  settingsModal: document.getElementById('settings-modal'),
  deviceEditModal: document.getElementById('device-edit-modal'),
  shortcutsModal: document.getElementById('shortcuts-modal'),
  textInputModal: document.getElementById('text-input-modal'),
  shortcutList: document.getElementById('shortcut-list'),
  deviceCount: document.getElementById('device-count'),
  devicesGrid: document.getElementById('devices-grid'),
  devicesEmpty: document.getElementById('devices-empty'),
  devicesList: document.getElementById('devices-list'),
  deviceEditTitle: document.getElementById('device-edit-title'),
  deviceNameInput: document.getElementById('device-name-input'),
  deviceGroupSelect: document.getElementById('device-group-select'),
  textModalTitle: document.getElementById('text-modal-title'),
  textInputField: document.getElementById('text-input-field'),
  textSendStatus: document.getElementById('text-send-status'),
  controlTitle: document.getElementById('control-title'),
  controlDescription: document.getElementById('control-description'),
  btnStart: document.getElementById('btn-start'),
  btnStop: document.getElementById('btn-stop'),
  scrcpyStatus: document.getElementById('scrcpy-status'),
  tailscaleStatus: document.getElementById('tailscale-status'),
  parsecStatus: document.getElementById('parsec-status'),
  toggleAutostart: document.getElementById('toggle-autostart'),
  settingMaxSize: document.getElementById('setting-max-size'),
  settingMaxFps: document.getElementById('setting-max-fps'),
  settingBitrate: document.getElementById('setting-bitrate'),
  settingBorderless: document.getElementById('setting-borderless'),
  settingAlwaysOnTop: document.getElementById('setting-always-on-top'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnCloseDeviceEdit: document.getElementById('btn-close-device-edit'),
  btnSaveDevice: document.getElementById('btn-save-device'),
  btnResetDevice: document.getElementById('btn-reset-device'),
  btnCloseShortcuts: document.getElementById('btn-close-shortcuts'),
  btnCloseTextModal: document.getElementById('btn-close-text-modal'),
  btnSendText: document.getElementById('btn-send-text'),
  btnSendEnter: document.getElementById('btn-send-enter'),
  btnSendBackspace: document.getElementById('btn-send-backspace'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnAbout: document.getElementById('btn-about'),
  btnRefreshDevices: document.getElementById('btn-refresh-devices'),
  btnScanDevices: document.getElementById('btn-scan-devices'),
  btnRefreshStatus: document.getElementById('btn-refresh-status'),
  btnSettings: document.getElementById('btn-settings'),
  themeButtons: document.querySelectorAll('.theme-btn')
};

// Focus trap
let lastFocusedElement = null;
let _activeTrapHandler = null;
let _activeTrapElement = null;

function trapFocus(modalElement) {
  removeTrapFocus();

  const focusableElements = modalElement.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  
  lastFocusedElement = document.activeElement;
  
  const handler = function trapTabKey(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
    
    if (e.key === 'Escape') {
      closeActiveModal();
    }
  };

  modalElement.addEventListener('keydown', handler);
  _activeTrapHandler = handler;
  _activeTrapElement = modalElement;
  
  requestAnimationFrame(() => {
    firstFocusable.focus();
  });
}

function removeTrapFocus() {
  if (_activeTrapElement && _activeTrapHandler) {
    _activeTrapElement.removeEventListener('keydown', _activeTrapHandler);
    _activeTrapHandler = null;
    _activeTrapElement = null;
  }
}

function returnFocus() {
  removeTrapFocus();
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

function closeActiveModal() {
  const modals = [
    elements.settingsModal,
    elements.deviceEditModal,
    elements.shortcutsModal,
    elements.textInputModal
  ];
  
  const openModal = modals.find(modal => modal && !modal.classList.contains('hidden'));
  if (openModal) {
    openModal.classList.add('hidden');
    returnFocus();
  }
}

// =====================================================
// BACK NAVIGATION
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
        <span class="shortcut-key">${escapeHtml(s.key)}</span>
        <span class="shortcut-action">${escapeHtml(s.action)}</span>
      </div>
    `).join('');
    elements.shortcutsModal.classList.remove('hidden');
    trapFocus(elements.shortcutsModal);
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

  PhoneFarmLoading.show('Refreshing devices...');
  try {
    const mergedDevices = await window.electronAPI.getMergedDevices();
    if (mergedDevices && Array.isArray(mergedDevices)) {
      devices = mergedDevices;
    } else {
      devices = [];
    }
    updateDevicesUI();
  } catch (e) {
    console.error('[Renderer] refreshDevicesWithMerge error:', e);
    await refreshDevices();
  } finally {
    PhoneFarmLoading.hide();
  }
}

async function refreshDevices() {
  try {
    const result = await window.electronAPI.refreshDevices();
    if (result && result.success) {
      devices = result.devices || [];
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
  elements.deviceCount.textContent = `${count} phone${count !== 1 ? 's' : ''}`;
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
        <h3>Waiting for Phone</h3>
        <p>Connect phone via USB and enable USB debugging mode.</p>
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
      const statusText = isActive ? 'Active' : 'Connected';

      html += `
        <div class="connected-device-item ${isActive ? 'active' : ''}">
          <span class="device-emoji">${escapeHtml(emoji)}</span>
          <div class="device-info-compact">
            <span class="device-name-compact">${escapeHtml(displayName)}</span>
            <span class="device-battery-compact">${getBatteryIcon(device.battery)} ${escapeHtml(String(device.battery ?? '?'))}%</span>
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

    const colorStyle = device.color && /^#[0-9a-fA-F]{3,8}$/.test(device.color) ? `border-left: 4px solid ${device.color}` : '';
    const batteryIcon = getBatteryIcon(device.battery);
    const batteryLevel = device.battery;
    const batteryClass = batteryLevel == null
      ? ''
      : (batteryLevel < 20 ? 'text-error' : (batteryLevel < 50 ? 'text-warning' : ''));
    const displayName = device.customName || device.model;
    const emoji = device.emoji || '';
    const originalName = device.customName ? device.model : '';

    html += `
      <div class="${cardClasses.join(' ')}" data-device-id="${escapeHtml(device.id)}" data-index="${i}" role="listitem" aria-label="${escapeHtml(displayName)} device, ${isActive ? 'active' : 'ready'}" style="${colorStyle}">
        <span class="edit-hint">Double click: Edit</span>
        <div class="device-header">
          <span class="device-icon">${escapeHtml(emoji) || '📱'}</span>
          <span class="status-badge ${isActive ? 'status-online' : 'status-unknown'}">
            ${isActive ? 'Active' : 'Ready'}
          </span>
        </div>
        <div class="device-name">${escapeHtml(displayName)}</div>
        ${originalName ? `<div class="device-id">${escapeHtml(originalName)}</div>` : ''}
        <div class="device-id">${escapeHtml(device.id)}</div>
        <div class="device-info">
          <span class="device-info-item ${batteryClass}">${batteryIcon} ${escapeHtml(String(device.battery ?? '?'))}%</span>
          <span class="device-info-item">${escapeHtml(device.screenSize?.width || '?')}x${escapeHtml(device.screenSize?.height || '?')}</span>
        </div>
        <div class="device-actions">
          ${isActive
            ? `<button class="btn btn-sm btn-danger btn-block device-stop-btn" data-device-id="${escapeHtml(device.id)}">Stop</button>`
            : `<button class="btn btn-sm btn-primary btn-block device-start-btn" data-device-id="${escapeHtml(device.id)}">Start</button>`
          }
          <button class="btn btn-sm device-text-btn device-send-text-btn" data-device-id="${escapeHtml(device.id)}" title="Send Text">Text</button>
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
      PhoneFarmNotification.show('Phone limit could not be checked. Please try again.', 'error');
      return;
    }
    if (!limitCheck.allowed) {
      PhoneFarmNotification.show(limitCheck.reason || 'Phone limit exceeded. Reduce the number of active devices.', 'warning');
      return;
    }

    const result = await window.electronAPI.scrcpyStartDevice(deviceId);
    if (result && result.success) {
      activeDevices.add(deviceId);
      renderDeviceCards();
      updateControlPanel();
      await window.electronAPI.setFarmRunning(true);
    } else {
      PhoneFarmNotification.show('Device could not be started: ' + (result?.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    console.error('Start device error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
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
   trapFocus(elements.deviceEditModal);
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
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
  }
}

async function resetDeviceEdit() {
  if (!editingDeviceId) return;

  window.PhoneFarmConfirmModal.show({
    title: 'Ayarları Sıfırla',
    message: 'Bu cihazın tüm özel ayarlarını sıfırlamak istediğinize emin misiniz?',
    onConfirm: async () => {
      try {
        await window.electronAPI.deleteDeviceData(editingDeviceId);
        closeDeviceEdit();
        await refreshDevicesWithMerge();
      } catch (e) {
        console.error('Reset device error:', e);
      }
    }
  });
}

function closeDeviceEdit() {
  elements.deviceEditModal.classList.add('hidden');
  removeTrapFocus();
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
  elements.textModalTitle.textContent = `Send Text - ${displayName}`;
  elements.textInputField.value = '';
  elements.textSendStatus.classList.add('hidden');
  elements.textInputModal.classList.remove('hidden');
  trapFocus(elements.textInputModal);
  elements.textInputField.focus();
}

function closeTextModal() {
  elements.textInputModal.classList.add('hidden');
  removeTrapFocus();
  returnFocus();
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
      showTextStatus('Text sent!', false);
      elements.textInputField.value = '';
      elements.textInputField.focus();
    } else {
      showTextStatus('Error: ' + (result?.error || 'Could not send'), true);
    }
} catch (e) {
      console.error('Send text error:', e);
      const h = await window.electronAPI.humanizeError(e?.message || String(e));
      showTextStatus(h.title + ': ' + h.hint, true);
    }
}

async function sendEnterKey() {
  if (!textModalDeviceId) return;
  try {
    const result = await window.electronAPI.sendKeyToDevice(textModalDeviceId, 66); // KEYCODE_ENTER
    if (result && result.success) {
      showTextStatus('Enter sent!', false);
    } else {
      showTextStatus('Error: ' + (result?.error || 'Could not send'), true);
    }
  } catch (e) {
    console.error('Send enter error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    showTextStatus(h.title + ': ' + h.hint, true);
  }
}

async function sendBackspace() {
  if (!textModalDeviceId) return;
  try {
    const result = await window.electronAPI.sendKeyToDevice(textModalDeviceId, 67); // KEYCODE_DEL
    if (result && result.success) {
      showTextStatus('Delete key sent!', false);
    } else {
      showTextStatus('Error: ' + (result?.error || 'Could not send'), true);
    }
  } catch (e) {
    console.error('Send backspace error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    showTextStatus(h.title + ': ' + h.hint, true);
  }
}

// =====================================================
// CONTROL PANEL FUNCTIONS
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: CONTROL PANEL FUNCTIONS ===== */

function updateControlPanel() {
  isRunning = activeDevices.size > 0;

  if (isRunning) {
    elements.controlTitle.textContent = `${activeDevices.size} Phone${activeDevices.size !== 1 ? 's' : ''} Active`;
    elements.controlDescription.textContent = 'Phones are displayed on screen. Use the button below to stop.';
    elements.btnStart.disabled = true;
    elements.btnStop.disabled = false;
  } else {
    elements.controlTitle.textContent = 'Phone Control';
    elements.controlDescription.textContent = 'Click Start to display phones.';
    elements.btnStart.disabled = devices.length === 0;
    elements.btnStop.disabled = true;
  }

  elements.scrcpyStatus.textContent = `${activeDevices.size} active`;
}

async function startAll() {
  elements.btnStart.disabled = true;
  elements.btnStart.innerHTML = '<span class="spinner"></span><span>Starting...</span>';

  PhoneFarmLoading.show('Starting farm...');
  try {
    // Check phone limit - will we exceed the limit?
    const maxPhones = licenseInfo?.maxPhones || 5;
    if (devices.length > maxPhones) {
      PhoneFarmNotification.show(`Phone limit will be exceeded! Maximum ${maxPhones} phones allowed. Connected: ${devices.length}`, 'warning');
      elements.btnStart.innerHTML = '<span>▶️</span><span>START</span>';
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
      PhoneFarmNotification.show('Could not start: ' + (result?.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    console.error('Start all error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
  } finally {
    PhoneFarmLoading.hide();
    elements.btnStart.innerHTML = '<span>▶️</span><span>START</span>';
    elements.btnStart.disabled = devices.length === 0 || isRunning;
  }
}

async function stopAll() {
  elements.btnStop.disabled = true;
  elements.btnStop.innerHTML = '<span class="spinner"></span><span>Stopping...</span>';

  PhoneFarmLoading.show('Stopping farm...');
  try {
    await window.electronAPI.scrcpyStopAll();
    activeDevices.clear();
    renderDeviceCards();
    updateControlPanel();
    await window.electronAPI.setFarmRunning(false);
  } catch (e) {
    console.error('Stop all error:', e);
  } finally {
    PhoneFarmLoading.hide();
    elements.btnStop.innerHTML = '<span>⏹️</span><span>STOP</span>';
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
        <span class="status-badge status-online">Connected</span>
        <span class="text-muted" style="font-size: 0.8rem; margin-left: 8px;">${escapeHtml(status.tailscale.ip || '')}</span>
      `;
    } else if (status.tailscale.running) {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-warning">Login Required</span>';
    } else if (status.tailscale.installed) {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-warning">Not Running</span>';
    } else {
      elements.tailscaleStatus.innerHTML = '<span class="status-badge status-offline">Not Installed</span>';
    }

    // Parsec
    if (status.parsec.loggedIn) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-online">Ready</span>';
    } else if (status.parsec.running) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-warning">Login Required</span>';
    } else if (status.parsec.installed) {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-warning">Not Running</span>';
    } else {
      elements.parsecStatus.innerHTML = '<span class="status-badge status-offline">Not Installed</span>';
    }

    // Scrcpy
    activeDevices = new Set(status.scrcpy.activeDevices || []);
    elements.scrcpyStatus.textContent = `${activeDevices.size} active`;

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
  trapFocus(elements.settingsModal);
  loadSettings();
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden');
  removeTrapFocus();
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

  // Load update settings
  try {
    const updateSettings = await window.electronAPI.updateGetSettings();
    if (updateSettings) {
      const autoUpdateEl = document.getElementById('setting-auto-update');
      const channelEl = document.getElementById('setting-update-channel');
      if (autoUpdateEl) autoUpdateEl.checked = updateSettings.autoCheck !== false;
      if (channelEl) channelEl.value = updateSettings.channel || 'stable';
    }
  } catch (e) {
    console.error('Load update settings error:', e);
  }

  // Load current app version
  try {
    const appInfo = await window.electronAPI.getAppInfo();
    const verEl = document.getElementById('update-current-version');
    if (verEl && appInfo) verEl.textContent = 'v' + appInfo.version;
  } catch (e) {
    console.error('Load version error:', e);
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
  } catch (e) {
    console.error('Save scrcpy settings error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || String(e));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
    return;
  }

  // Save update settings
  try {
    const autoUpdateEl = document.getElementById('setting-auto-update');
    const channelEl = document.getElementById('setting-update-channel');
    const updateSettings = {
      autoCheck: autoUpdateEl ? autoUpdateEl.checked : true,
      channel: channelEl ? channelEl.value : 'stable'
    };
    await window.electronAPI.updateSaveSettings(updateSettings);
  } catch (e) {
    console.error('Save update settings error:', e);
  }

  closeSettings();
}

function showUpdateStatus(message, type) {
  const el = document.getElementById('update-status-message');
  if (!el) return;
  el.textContent = message;
  el.className = 'update-status-message ' + (type || 'info');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 8000);
}

async function checkForUpdatesManually() {
  const btn = document.getElementById('btn-check-update-now');
  if (btn) btn.disabled = true;

  showUpdateStatus('Checking for updates...', 'info');

  try {
    await window.electronAPI.updateCheck();
  } catch (e) {
    console.error('Manual update check error:', e);
    const h = await window.electronAPI.humanizeError(e?.message || 'Unknown error');
    showUpdateStatus(h.title + ': ' + h.hint, 'error');
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; }, 3000);
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
// THEME
// =====================================================
/* ===== FILE REF: renderer.js | SECTION: THEME ===== */

const VALID_THEME_VALUES = ['dark', 'light'];

function applyTheme(theme) {
  const value = VALID_THEME_VALUES.includes(theme) ? theme : 'dark';
  document.documentElement.setAttribute('data-theme', value);
  syncThemeButtons(value);
}

function syncThemeButtons(activeTheme) {
  elements.themeButtons.forEach((btn) => {
    const isActive = btn.dataset.themeValue === activeTheme;
    btn.classList.toggle('btn-primary', isActive);
    btn.classList.toggle('btn-outline', !isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

async function selectTheme(theme) {
  if (!VALID_THEME_VALUES.includes(theme)) return;
  applyTheme(theme);
  try {
    await window.electronAPI.setTheme(theme);
  } catch (e) {
    console.error('Persist theme error:', e);
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

// Update settings
const btnCheckUpdate = document.getElementById('btn-check-update-now');
if (btnCheckUpdate) btnCheckUpdate.addEventListener('click', checkForUpdatesManually);
elements.btnCloseShortcuts?.addEventListener('click', () => {
  elements.shortcutsModal.classList.add('hidden');
  removeTrapFocus();
});

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

// IPC: UPDATE EVENTS
window.electronAPI.onUpdateAvailable((info) => {
  showUpdateStatus('Update v' + info.version + ' is available. Downloading...', 'info');
});

window.electronAPI.onUpdateNotAvailable(() => {
  showUpdateStatus('You are on the latest version.', 'success');
});

window.electronAPI.onUpdateError((message) => {
  showUpdateStatus('Update check failed: ' + message, 'error');
});

window.electronAPI.onUpdateDownloadProgress((progress) => {
  const pct = Math.round(progress.percent);
  showUpdateStatus('Downloading update: ' + pct + '%', 'info');
});

window.electronAPI.onUpdateDownloaded((info) => {
  showUpdateStatus('Update v' + info.version + ' downloaded. Restart to install.', 'success');
});

// =====================================================
// UTILITY FUNCTIONS
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
  } catch (e) {
    console.error('[Renderer] License info error:', e);
  }
}

async function init() {

   // Load license info first
   await loadLicenseInfo();

   await refreshDevicesWithMerge();
   await refreshStatus();

   setInterval(async () => {
     await refreshStatus();
     await refreshDevicesWithMerge();
   }, 10000);

    if (window.HealthDashboard) {
      window.HealthDashboard.mount('health-panel');
    }

    if (window.ConnectionBanner) {
      window.ConnectionBanner.init();
    }

   var btnRefreshHealth = document.getElementById('btn-refresh-health');
   if (btnRefreshHealth) {
     btnRefreshHealth.addEventListener('click', function () {
       if (window.HealthDashboard) window.HealthDashboard.refresh();
     });
   }

   // Initialize phone panel toggle
   const phonePanelToggleBtn = document.getElementById('btn-toggle-phone-panel');
   const phonePanelBody = document.getElementById('phone-panel-body');
   if (phonePanelToggleBtn && phonePanelBody) {
     phonePanelToggleBtn.addEventListener('click', () => {
       phonePanelBody.classList.toggle('hidden');
       // Toggle button text/icon
       const isHidden = phonePanelBody.classList.contains('hidden');
       phonePanelToggleBtn.innerHTML = isHidden ? '📞' : '📞';
     });
   }

   // Set up IPC listeners for phone panel
   window.electronAPI.onPhoneStateUpdate((state) => {
     if (window.PhonePanel) {
       window.PhonePanel.updateCallState(state);
     }
     // Show notification for call state changes
     if (window.PhoneFarmNotification) {
       let message = '';
       let type = 'info';
       switch (state) {
         case 'ringing':
           message = 'Incoming call...';
           type = 'warning';
           break;
         case 'active':
           message = 'Call active';
           type = 'success';
           break;
         case 'ended':
           message = 'Call ended';
           type = 'info';
           break;
         case 'idle':
           message = 'Ready to call';
           type = 'info';
           break;
       }
       if (message) {
         window.PhoneFarmNotification.show(message, type);
       }
     }
   });

 }

init();
