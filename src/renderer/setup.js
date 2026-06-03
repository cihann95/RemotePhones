// =====================================================
// PHONE FARM V2 - SETUP RENDERER
// =====================================================

// Elements
const els = {
  tailscaleStatus: document.getElementById('tailscale-status'),
  tailscaleProgress: document.getElementById('tailscale-progress'),
  tailscaleProgressBar: document.getElementById('tailscale-progress-bar'),
  tailscaleProgressText: document.getElementById('tailscale-progress-text'),
  btnTailscaleInstall: document.getElementById('btn-tailscale-install'),
  btnTailscaleLogin: document.getElementById('btn-tailscale-login'),
  btnTailscaleRefresh: document.getElementById('btn-tailscale-refresh'),
  stepTailscaleNumber: document.getElementById('step-tailscale-number'),

  parsecStatus: document.getElementById('parsec-status'),
  parsecProgress: document.getElementById('parsec-progress'),
  parsecProgressBar: document.getElementById('parsec-progress-bar'),
  parsecProgressText: document.getElementById('parsec-progress-text'),
  btnParsecInstall: document.getElementById('btn-parsec-install'),
  btnParsecOpen: document.getElementById('btn-parsec-open'),
  btnParsecRefresh: document.getElementById('btn-parsec-refresh'),
  stepParsecNumber: document.getElementById('step-parsec-number'),

  btnCompleteSetup: document.getElementById('btn-complete-setup'),
  btnSkipSetup: document.getElementById('btn-skip-setup'),
  stepCompleteNumber: document.getElementById('step-complete-number')
};

let tailscaleReady = false;
let parsecReady = false;
let _onTailscaleProgress = null;
let _onParsecProgress = null;
let _lastSetupCheck = 0;

// Check status
async function checkStatus() {
  if (Date.now() - _lastSetupCheck < 5000) return;
  _lastSetupCheck = Date.now();

  try {
    const status = await window.electronAPI.getFullStatus();

    // Tailscale
    if (status.tailscale.loggedIn) {
      els.tailscaleStatus.innerHTML = '<span class="status-badge status-online">Bagli ve Hazir</span>';
      els.btnTailscaleInstall.disabled = true;
      els.btnTailscaleLogin.disabled = true;
      els.stepTailscaleNumber.classList.add('completed');
      els.stepTailscaleNumber.textContent = '✓';
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
      els.stepParsecNumber.classList.add('completed');
      els.stepParsecNumber.textContent = '✓';
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

    // Complete button
    if (tailscaleReady && parsecReady) {
      els.btnCompleteSetup.disabled = false;
      els.stepCompleteNumber.classList.add('completed');
      els.stepCompleteNumber.textContent = '✓';
    } else {
      els.btnCompleteSetup.disabled = true;
    }
  } catch (e) {
    console.error('Check status error:', e);
  }
}

// Install Tailscale
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

// Login Tailscale
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

// Install Parsec
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

// Open Parsec
async function openParsec() {
  try {
    await window.electronAPI.parsecOpen();
  } catch (e) {
    console.error('Open Parsec error:', e);
  }
}

// Complete setup
async function completeSetup() {
  try {
    await window.electronAPI.completeSetup();
    await window.electronAPI.selectMode('home');
  } catch (e) {
    console.error('Complete setup error:', e);
  }
}

// Skip setup
async function skipSetup() {
  try {
    await window.electronAPI.completeSetup();
    await window.electronAPI.selectMode('home');
  } catch (e) {
    console.error('Skip setup error:', e);
  }
}

// Event listeners
els.btnTailscaleInstall.addEventListener('click', installTailscale);
els.btnTailscaleLogin.addEventListener('click', loginTailscale);
els.btnTailscaleRefresh.addEventListener('click', checkStatus);
els.btnParsecInstall.addEventListener('click', installParsec);
els.btnParsecOpen.addEventListener('click', openParsec);
els.btnParsecRefresh.addEventListener('click', checkStatus);
els.btnCompleteSetup.addEventListener('click', completeSetup);
els.btnSkipSetup.addEventListener('click', skipSetup);

// Initialize
checkStatus();
setInterval(checkStatus, 10000);
