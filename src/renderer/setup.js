// =====================================================
// PHONE FARM V2 - SETUP RENDERER
// 5-step wizard: Mode -> ADB -> Device -> Network -> License -> First Task
// =====================================================

// =====================================================
// HELPERS
// =====================================================
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =====================================================
// STATE
// =====================================================
const els = {
  // Step containers
  stepMode: document.getElementById('step-mode'),
  stepAdb: document.getElementById('step-adb'),
  stepDevice: document.getElementById('step-device'),
  stepNetwork: document.getElementById('step-network'),
  stepLicense: document.getElementById('step-license'),
  stepFirstTask: document.getElementById('step-first-task'),

  // Step numbers (for the colored circle)
  stepAdbNumber: document.getElementById('step-adb-number'),
  stepDeviceNumber: document.getElementById('step-device-number'),
  stepNetworkNumber: document.getElementById('step-network-number'),
  stepLicenseNumber: document.getElementById('step-license-number'),
  stepFirstTaskNumber: document.getElementById('step-first-task-number'),

  // Indicator
  stepIndicator: document.getElementById('step-indicator'),
  stepIndicatorLabel: document.getElementById('step-indicator-label'),

  // Mode selector
  modeOptionHome: document.getElementById('mode-option-home'),
  modeOptionOffice: document.getElementById('mode-option-office'),
  btnModeContinue: document.getElementById('btn-mode-continue'),

  // Step 1: ADB
  adbStatus: document.getElementById('adb-status'),
  btnAdbRetry: document.getElementById('btn-adb-retry'),
  btnAdbNext: document.getElementById('btn-adb-next'),

  // Step 2: Device
  deviceStatus: document.getElementById('device-status'),
  deviceList: document.getElementById('device-list'),
  btnDeviceRetry: document.getElementById('btn-device-retry'),
  btnDeviceNext: document.getElementById('btn-device-next'),

  // Step 3: Network (Tailscale + Parsec, preserved)
  tailscaleStatus: document.getElementById('tailscale-status'),
  tailscaleProgress: document.getElementById('tailscale-progress'),
  tailscaleProgressBar: document.getElementById('tailscale-progress-bar'),
  tailscaleProgressText: document.getElementById('tailscale-progress-text'),
  btnTailscaleInstall: document.getElementById('btn-tailscale-install'),
  btnTailscaleLogin: document.getElementById('btn-tailscale-login'),
  btnTailscaleRefresh: document.getElementById('btn-tailscale-refresh'),

  parsecStatus: document.getElementById('parsec-status'),
  parsecProgress: document.getElementById('parsec-progress'),
  parsecProgressBar: document.getElementById('parsec-progress-bar'),
  parsecProgressText: document.getElementById('parsec-progress-text'),
  btnParsecInstall: document.getElementById('btn-parsec-install'),
  btnParsecOpen: document.getElementById('btn-parsec-open'),
  btnParsecRefresh: document.getElementById('btn-parsec-refresh'),

  btnNetworkSkip: document.getElementById('btn-network-skip'),
  btnNetworkNext: document.getElementById('btn-network-next'),

  // Step 4: License
  licenseStatus: document.getElementById('license-status'),
  btnLicenseSkip: document.getElementById('btn-license-skip'),
  btnLicenseNext: document.getElementById('btn-license-next'),

  // Step 5: First task
  firstTaskStatus: document.getElementById('first-task-status'),
  firstTaskResult: document.getElementById('first-task-result'),
  btnFirstTaskRun: document.getElementById('btn-first-task-run'),
  btnFirstTaskSkip: document.getElementById('btn-first-task-skip')
};

// Step IDs in canonical order. Network is optional (skipped in Home mode).
const ALL_STEPS = ['adb', 'device', 'network', 'license', 'first-task'];
const STEP_LABELS = {
  'adb': 'ADB Kontrolü',
  'device': 'Cihaz Algılama',
  'network': 'Ağ Kurulumu',
  'license': 'Lisans',
  'first-task': 'İlk Görev'
};

let selectedMode = null;     // 'home' | 'office' | null
let currentStep = null;       // 'adb' | 'device' | ... | null when on mode selector
let completedSteps = new Set();

// Tailscale/Parsec state (preserved from original)
let tailscaleReady = false;
let parsecReady = false;
let _onTailscaleProgress = null;
let _onParsecProgress = null;
let _lastSetupCheck = 0;
let _lastLicenseCheck = 0;
let _lastDeviceCheck = 0;

// =====================================================
// STEP INDICATOR
// =====================================================
function getAvailableSteps() {
  // Home mode skips the network step
  if (selectedMode === 'home') {
    return ALL_STEPS.filter(s => s !== 'network');
  }
  return [...ALL_STEPS];
}

function renderIndicator() {
  const available = getAvailableSteps();
  els.stepIndicator.innerHTML = '';
  available.forEach((step, i) => {
    const dot = document.createElement('div');
    dot.className = 'step-dot';
    if (currentStep === step) dot.classList.add('current');
    if (completedSteps.has(step)) dot.classList.add('completed');
    if (completedSteps.has(step) && currentStep !== step) {
      dot.textContent = '✓';
    } else {
      dot.textContent = String(i + 1);
    }
    els.stepIndicator.appendChild(dot);

    if (i < available.length - 1) {
      const line = document.createElement('div');
      line.className = 'step-dot-line';
      if (completedSteps.has(step)) line.classList.add('completed');
      els.stepIndicator.appendChild(line);
    }
  });

  // Label
  if (currentStep === null) {
    els.stepIndicatorLabel.textContent = 'Mod Seçimi';
  } else {
    const idx = available.indexOf(currentStep);
    els.stepIndicatorLabel.textContent = `Adım ${idx + 1} / ${available.length} - ${STEP_LABELS[currentStep]}`;
  }
}

// =====================================================
// STEP NAVIGATION
// =====================================================
function showStep(stepId) {
  // Hide all step blocks
  [els.stepMode, els.stepAdb, els.stepDevice, els.stepNetwork, els.stepLicense, els.stepFirstTask]
    .forEach(el => el && el.classList.add('hidden'));

  // Show target step
  const map = {
    'adb': els.stepAdb,
    'device': els.stepDevice,
    'network': els.stepNetwork,
    'license': els.stepLicense,
    'first-task': els.stepFirstTask
  };
  if (stepId === null) {
    els.stepMode.classList.remove('hidden');
  } else if (map[stepId]) {
    map[stepId].classList.remove('hidden');
  }
  currentStep = stepId;
  renderIndicator();

  // Auto-run checks when entering a step
  if (stepId === 'adb') {
    checkAdb();
  } else if (stepId === 'device') {
    checkDevices();
  } else if (stepId === 'license') {
    checkLicense();
  }
}

function markStepComplete(stepId) {
  completedSteps.add(stepId);
  // Update the step number visual
  const numMap = {
    'adb': els.stepAdbNumber,
    'device': els.stepDeviceNumber,
    'network': els.stepNetworkNumber,
    'license': els.stepLicenseNumber,
    'first-task': els.stepFirstTaskNumber
  };
  if (numMap[stepId]) {
    numMap[stepId].classList.add('completed');
    numMap[stepId].textContent = '✓';
  }
  renderIndicator();
}

function nextStep() {
  const available = getAvailableSteps();
  const currentIdx = currentStep === null ? -1 : available.indexOf(currentStep);
  if (currentStep !== null) {
    markStepComplete(currentStep);
  }
  if (currentIdx + 1 < available.length) {
    showStep(available[currentIdx + 1]);
  } else {
    // Past the last step — finish
    completeSetup();
  }
}

function prevStep() {
  const available = getAvailableSteps();
  const currentIdx = currentStep === null ? 0 : available.indexOf(currentStep);
  if (currentIdx > 0) {
    showStep(available[currentIdx - 1]);
  } else {
    // Back to mode selector
    showStep(null);
  }
}

// =====================================================
// MODE SELECTION (STEP 0)
// =====================================================
function selectMode(mode) {
  selectedMode = mode;
  els.modeOptionHome.classList.toggle('selected', mode === 'home');
  els.modeOptionOffice.classList.toggle('selected', mode === 'office');
  els.btnModeContinue.disabled = false;
}

els.modeOptionHome.addEventListener('click', () => selectMode('home'));
els.modeOptionOffice.addEventListener('click', () => selectMode('office'));
els.btnModeContinue.addEventListener('click', () => {
  if (!selectedMode) return;
  // Reset completion state for the new flow
  completedSteps = new Set();
  // Advance to first real step
  showStep(ALL_STEPS[0]);
});

// =====================================================
// STEP 1: ADB CHECK
// =====================================================
async function checkAdb() {
  els.adbStatus.innerHTML = '<span class="status-badge status-unknown"><span class="spinner"></span> ADB kontrol ediliyor...</span>';
  els.btnAdbNext.disabled = true;
  els.btnAdbRetry.hidden = true;

  if (!window.electronAPI || !window.electronAPI.adbStatus) {
    els.adbStatus.innerHTML =
      '<span class="status-badge status-warning">⚠ ADB kontrolü yalnızca uygulama içinde çalışır. (Önizleme modu)</span>';
    return;
  }

  try {
    const status = await window.electronAPI.adbStatus();

    if (status && status.running) {
      const version = status.version || 'bilinmiyor';
      els.adbStatus.innerHTML =
        `<span class="status-badge status-online">✓ ADB hazır (v${version})</span>`;
      els.btnAdbNext.disabled = false;
    } else if (status && status.installed) {
      els.adbStatus.innerHTML =
        `<span class="status-badge status-warning">⚠ ADB kurulu ama çalışmıyor. "Yeniden Dene" tıklayın.</span>`;
      els.btnAdbRetry.hidden = false;
    } else {
      els.adbStatus.innerHTML =
        `<span class="status-badge status-offline">✗ ADB bulunamadı. PATH'te platform-tools yüklü olmalı.</span>`;
      els.btnAdbRetry.hidden = false;
    }
  } catch (e) {
    console.error('ADB check error:', e);
    els.adbStatus.innerHTML =
      `<span class="status-badge status-offline">✗ ADB kontrolü başarısız: ${escapeHtml(e.message || String(e))}</span>`;
    els.btnAdbRetry.hidden = false;
  }
}

els.btnAdbRetry.addEventListener('click', checkAdb);
els.btnAdbNext.addEventListener('click', nextStep);

// =====================================================
// STEP 2: DEVICE DETECTION
// =====================================================
async function checkDevices() {
  if (!window.electronAPI || !window.electronAPI.getDevices) {
    els.deviceStatus.innerHTML =
      '<span class="status-badge status-warning">⚠ Cihaz taraması yalnızca uygulama içinde çalışır. (Önizleme modu)</span>';
    els.deviceList.innerHTML = '<div class="device-list-empty">Önizleme modu — gerçek cihaz listesi burada görünecek.</div>';
    return;
  }
  if (Date.now() - _lastDeviceCheck < 2000) return;
  _lastDeviceCheck = Date.now();

  els.deviceStatus.innerHTML = '<span class="status-badge status-unknown"><span class="spinner"></span> Cihazlar aranıyor...</span>';
  els.deviceList.innerHTML = '';
  els.btnDeviceNext.disabled = true;
  els.btnDeviceRetry.hidden = true;

  try {
    const devices = await window.electronAPI.getDevices();

    if (!devices || devices.length === 0) {
      els.deviceStatus.innerHTML =
        `<span class="status-badge status-offline">✗ Cihaz bulunamadı. USB kablosunu kontrol edin.</span>`;
      els.deviceList.innerHTML =
        '<div class="device-list-empty">Henüz cihaz yok.<br><small>USB kablosunu takıp "Yeniden Dene" tıklayın.</small></div>';
      els.btnDeviceRetry.hidden = false;
      return;
    }

    els.deviceStatus.innerHTML =
      `<span class="status-badge status-online">✓ ${devices.length} cihaz bulundu</span>`;
    els.deviceList.innerHTML = devices.map(d => `
      <div class="device-row">
        <div class="device-row-info">
          <span class="device-row-model">${escapeHtml(d.model || d.product || 'Android Cihaz')}</span>
          <span class="device-row-serial">${escapeHtml(d.id || d.serial || '')}</span>
        </div>
        <span class="status-badge ${d.status === 'device' ? 'status-online' : 'status-warning'}">${escapeHtml(d.status || 'unknown')}</span>
      </div>
    `).join('');
    els.btnDeviceNext.disabled = false;
  } catch (e) {
    console.error('Device check error:', e);
    els.deviceStatus.innerHTML =
      `<span class="status-badge status-offline">✗ Cihaz listesi alınamadı: ${escapeHtml(e.message || String(e))}</span>`;
    els.btnDeviceRetry.hidden = false;
  }
}

els.btnDeviceRetry.addEventListener('click', checkDevices);
els.btnDeviceNext.addEventListener('click', nextStep);

// =====================================================
// STEP 3: NETWORK SETUP (Tailscale + Parsec — preserved logic)
// =====================================================
async function checkStatus() {
  if (!window.electronAPI || !window.electronAPI.getFullStatus) return;
  if (Date.now() - _lastSetupCheck < 5000) return;
  _lastSetupCheck = Date.now();

  try {
    const status = await window.electronAPI.getFullStatus();

    // Tailscale
    if (status.tailscale.loggedIn) {
      els.tailscaleStatus.innerHTML = '<span class="status-badge status-online">Bagli ve Hazir</span>';
      els.btnTailscaleInstall.disabled = true;
      els.btnTailscaleLogin.disabled = true;
      tailscaleReady = true;
    } else if (status.tailscale.installed) {
      els.tailscaleStatus.innerHTML = '<span class="status-badge status-warning">Kurulu - Giris Gerekli</span>';
      els.btnTailscaleInstall.disabled = true;
      els.btnTailscaleLogin.disabled = false;
      tailscaleReady = false;
    } else {
      els.tailscaleStatus.innerHTML = '<span class="status-badge status-offline">Kurulu Degil</span>';
      els.btnTailscaleInstall.disabled = false;
      els.btnTailscaleLogin.disabled = true;
      tailscaleReady = false;
    }

    // Parsec
    if (status.parsec.loggedIn) {
      els.parsecStatus.innerHTML = '<span class="status-badge status-online">Bagli ve Hazir</span>';
      els.btnParsecInstall.disabled = true;
      els.btnParsecOpen.disabled = true;
      parsecReady = true;
    } else if (status.parsec.installed) {
      els.parsecStatus.innerHTML = '<span class="status-badge status-warning">Kurulu - Giris Gerekli</span>';
      els.btnParsecInstall.disabled = true;
      els.btnParsecOpen.disabled = false;
      parsecReady = false;
    } else {
      els.parsecStatus.innerHTML = '<span class="status-badge status-offline">Kurulu Degil</span>';
      els.btnParsecInstall.disabled = false;
      els.btnParsecOpen.disabled = true;
      parsecReady = false;
    }
  } catch (e) {
    console.error('Check status error:', e);
  }
}

async function installTailscale() {
  els.btnTailscaleInstall.disabled = true;
  els.tailscaleProgress.classList.remove('hidden');

  _onTailscaleProgress?.();
  _onTailscaleProgress = window.electronAPI.onTailscaleInstallProgress((progress) => {
    els.tailscaleProgressBar.style.width = progress + '%';
    els.tailscaleProgressText.textContent = `Indiriliyor... ${progress}%`;
  });

  try {
    const result = await window.electronAPI.tailscaleInstall();
    if (result.success) {
      els.tailscaleProgressText.textContent = 'Kurulum tamamlandi!';
      await checkStatus();
    } else {
      els.tailscaleProgressText.textContent = 'Kurulum basarisiz: ' + result.error;
    }
  } catch (e) {
    els.tailscaleProgressText.textContent = 'Hata: ' + e.message;
  } finally {
    setTimeout(() => {
      _onTailscaleProgress?.();
      els.tailscaleProgress.classList.add('hidden');
      els.btnTailscaleInstall.disabled = false;
    }, window.electronAPI.constants.INSTALL_PROGRESS_DELAY_MS);
  }
}

async function loginTailscale() {
  els.btnTailscaleLogin.disabled = true;
  els.btnTailscaleLogin.textContent = 'Bekleniyor...';

  try {
    await window.electronAPI.tailscaleLogin();
    await checkStatus();
  } catch (e) {
    console.error('Tailscale login error:', e);
  }

  els.btnTailscaleLogin.disabled = false;
  els.btnTailscaleLogin.textContent = 'Giris Yap';
}

async function installParsec() {
  els.btnParsecInstall.disabled = true;
  els.parsecProgress.classList.remove('hidden');

  _onParsecProgress?.();
  _onParsecProgress = window.electronAPI.onParsecInstallProgress((progress) => {
    els.parsecProgressBar.style.width = progress + '%';
    els.parsecProgressText.textContent = `Indiriliyor... ${progress}%`;
  });

  try {
    const result = await window.electronAPI.parsecInstall();
    if (result.success) {
      els.parsecProgressText.textContent = 'Kurulum tamamlandi!';
      await checkStatus();
    } else {
      els.parsecProgressText.textContent = 'Kurulum basarisiz: ' + result.error;
    }
  } catch (e) {
    els.parsecProgressText.textContent = 'Hata: ' + e.message;
  } finally {
    setTimeout(() => {
      _onParsecProgress?.();
      els.parsecProgress.classList.add('hidden');
      els.btnParsecInstall.disabled = false;
    }, window.electronAPI.constants.INSTALL_PROGRESS_DELAY_MS);
  }
}

async function openParsec() {
  try {
    await window.electronAPI.parsecOpen();
  } catch (e) {
    console.error('Open Parsec error:', e);
  }
}

els.btnTailscaleInstall.addEventListener('click', installTailscale);
els.btnTailscaleLogin.addEventListener('click', loginTailscale);
els.btnTailscaleRefresh.addEventListener('click', checkStatus);
els.btnParsecInstall.addEventListener('click', installParsec);
els.btnParsecOpen.addEventListener('click', openParsec);
els.btnParsecRefresh.addEventListener('click', checkStatus);
els.btnNetworkNext.addEventListener('click', nextStep);
els.btnNetworkSkip.addEventListener('click', nextStep);

// =====================================================
// STEP 4: LICENSE
// =====================================================
async function checkLicense() {
  if (!window.electronAPI || !window.electronAPI.getLicenseInfo) {
    els.licenseStatus.innerHTML =
      '<span class="status-badge status-warning">⚠ Lisans kontrolü yalnızca uygulama içinde çalışır. (Önizleme modu)</span>';
    return;
  }
  if (Date.now() - _lastLicenseCheck < 2000) return;
  _lastLicenseCheck = Date.now();

  els.licenseStatus.innerHTML = '<span class="status-badge status-unknown"><span class="spinner"></span> Lisans kontrol ediliyor...</span>';

  try {
    const info = await window.electronAPI.getLicenseInfo();
    if (info && info.isValid) {
      const expiry = info.expiryDate ? ` (Bitis: ${info.expiryDate})` : '';
      els.licenseStatus.innerHTML =
        `<span class="status-badge status-online">✓ Lisans geçerli${escapeHtml(expiry)}</span>`;
    } else {
      els.licenseStatus.innerHTML =
        `<span class="status-badge status-warning">⚠ Lisans bulunamadı. Ayarlar > Lisans bölümünden etkinleştirebilirsiniz.</span>`;
    }
  } catch (e) {
    console.error('License check error:', e);
    els.licenseStatus.innerHTML =
      `<span class="status-badge status-unknown">? Lisans durumu belirlenemedi (devam edebilirsiniz)</span>`;
  }
}

els.btnLicenseNext.addEventListener('click', nextStep);
els.btnLicenseSkip.addEventListener('click', nextStep);

// =====================================================
// STEP 5: FIRST TASK
// =====================================================
async function runFirstTask() {
  els.btnFirstTaskRun.disabled = true;
  els.btnFirstTaskSkip.disabled = true;
  els.firstTaskResult.classList.add('hidden');
  els.firstTaskStatus.innerHTML = '<span class="status-badge status-unknown"><span class="spinner"></span> Sağlık kontrolü çalışıyor...</span>';

  if (!window.electronAPI || !window.electronAPI.getDevices) {
    els.firstTaskStatus.innerHTML =
      '<span class="status-badge status-warning">⚠ Sağlık kontrolü yalnızca uygulama içinde çalışır. (Önizleme modu)</span>';
    els.btnFirstTaskRun.disabled = false;
    els.btnFirstTaskSkip.disabled = false;
    return;
  }

  try {
    const devices = await window.electronAPI.getDevices();
    if (!devices || devices.length === 0) {
      els.firstTaskStatus.innerHTML =
        `<span class="status-badge status-warning">⚠ Cihaz yok. Testi atlayıp ana sayfaya geçiliyor.</span>`;
      return;
    }

    const firstDevice = devices[0];
    const deviceId = firstDevice.id || firstDevice.serial;
    const health = await window.electronAPI.getDeviceHealth(deviceId);

    els.firstTaskStatus.innerHTML =
      `<span class="status-badge status-online">✓ Sağlık kontrolü başarılı</span>`;

    // Render result card
    const rows = [];
    rows.push(['Cihaz', health.model || firstDevice.model || 'Android Cihaz']);
    rows.push(['Seri No', health.deviceId || deviceId]);
    if (health.batteryLevel != null) rows.push(['Batarya', `${health.batteryLevel}%`]);
    if (health.androidVersion) rows.push(['Android', health.androidVersion]);
    if (health.signalStrength != null) rows.push(['Sinyal', `${health.signalStrength}/5`]);
    if (health.temperature != null) rows.push(['Sıcaklık', `${health.temperature}°C`]);
    if (health.memoryUsed != null && health.memoryTotal != null) {
      rows.push(['Bellek', `${health.memoryUsed} MB / ${health.memoryTotal} MB`]);
    }
    if (rows.length === 0) {
      rows.push(['Sonuç', 'Cihaz yanıt verdi ✓']);
    }

    els.firstTaskResult.innerHTML = `
      <h4>İlk Cihaz Sağlık Raporu</h4>
      ${rows.map(([label, value]) => `
        <div class="first-task-row">
          <span class="first-task-label">${escapeHtml(label)}</span>
          <span class="first-task-value">${escapeHtml(String(value))}</span>
        </div>
      `).join('')}
    `;
    els.firstTaskResult.classList.remove('hidden');

    // Change button label
    els.btnFirstTaskRun.textContent = 'Ana Sayfaya Geç →';
    els.btnFirstTaskRun.disabled = false;
    els.btnFirstTaskRun.removeEventListener('click', runFirstTask);
    els.btnFirstTaskRun.addEventListener('click', completeSetup);
  } catch (e) {
    console.error('First task error:', e);
    els.firstTaskStatus.innerHTML =
      `<span class="status-badge status-offline">✗ Sağlık kontrolü başarısız: ${escapeHtml(e.message || String(e))}</span>`;
    els.btnFirstTaskRun.disabled = false;
    els.btnFirstTaskSkip.disabled = false;
  }
}

els.btnFirstTaskRun.addEventListener('click', runFirstTask);
els.btnFirstTaskSkip.addEventListener('click', completeSetup);

// =====================================================
// COMPLETION
// =====================================================
async function completeSetup() {
  if (!window.electronAPI || !window.electronAPI.completeSetup) {
    console.warn('completeSetup called outside Electron (preview mode)');
    return;
  }
  try {
    await window.electronAPI.completeSetup();
    await window.electronAPI.selectMode(selectedMode || 'home');
  } catch (e) {
    console.error('Complete setup error:', e);
  }
}

// =====================================================
// PREV BUTTON (delegated, since multiple steps have one)
// =====================================================
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.dataset && target.dataset.action === 'prev') {
    prevStep();
  }
});

// =====================================================
// INIT
// =====================================================
function init() {
  // Show mode selector first
  showStep(null);

  // Start network status polling in the background (it's harmless
  // when not on the network step, and ready when the user reaches it)
  setInterval(checkStatus, 10000);
}

init();
