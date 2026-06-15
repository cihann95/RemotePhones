// =====================================================
// PHONE FARM V2 - OFFICE MODE RENDERER
// =====================================================

function _escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Elements
const elements = {
  btnBack: document.getElementById('btn-back'),
  btnConnect: document.getElementById('btn-connect'),
  tailscaleStatus: document.getElementById('tailscale-status'),
  parsecStatus: document.getElementById('parsec-status'),
  btnRefreshStatus: document.getElementById('btn-refresh-status'),
  btnOpenParsec: document.getElementById('btn-open-parsec'),
  btnOpenTailscale: document.getElementById('btn-open-tailscale'),
  settingsModal: document.getElementById('settings-modal'),
  btnSettings: document.getElementById('btn-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnOpenSetup: document.getElementById('btn-open-setup'),
  btnMinimize: document.getElementById('btn-minimize')
};

// Back button
elements.btnBack?.addEventListener('click', async () => {
  await window.electronAPI.goBack();
});

// Refresh status
async function refreshStatus() {
  try {
    const status = await window.electronAPI.getFullStatus();
    if (!status.success) return;

    // Tailscale
    if (status.tailscale.loggedIn) {
      elements.tailscaleStatus.innerHTML = `
        <span class="status-badge status-online">Bagli</span>
        <span class="text-muted" style="font-size: 0.8rem; margin-left: 8px;">${_escapeHtml(status.tailscale.ip || '')}</span>
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

    // Update connect button state
    const canConnect = status.tailscale.loggedIn && status.parsec.loggedIn;
    elements.btnConnect.disabled = !canConnect;
  } catch (e) {
    console.error('Refresh status error:', e);
  }
}

// Connect to Parsec
async function connectToParsec() {
  if (!elements.btnConnect) return;

  elements.btnConnect.disabled = true;
  elements.btnConnect.innerHTML = '<span class="spinner"></span><span>Baglaniyor...</span>';

  try {
    await window.electronAPI.parsecOpen();
  } catch (e) {
    console.error('Connect error:', e);
    const h = await window.electronAPI.humanizeError(e.message || String(e));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
  } finally {
    if (elements.btnConnect) {
      elements.btnConnect.innerHTML = '<span>🎮</span><span>PARSEC BAGLAN</span>';
      elements.btnConnect.disabled = false;
    }
  }
}

// Settings
function openSettings() {
  elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden');
}

async function openSetup() {
  await window.electronAPI.navigateToSetup();
}

// Quick actions
async function openParsec() {
  await window.electronAPI.parsecOpen();
}

async function openTailscaleAdmin() {
  await window.electronAPI.tailscaleOpenAdmin();
}

// Event listeners
elements.btnConnect?.addEventListener('click', connectToParsec);
elements.btnRefreshStatus?.addEventListener('click', refreshStatus);
elements.btnOpenParsec?.addEventListener('click', openParsec);
elements.btnOpenTailscale?.addEventListener('click', openTailscaleAdmin);
elements.btnSettings?.addEventListener('click', openSettings);
elements.btnCloseSettings?.addEventListener('click', closeSettings);
elements.btnOpenSetup?.addEventListener('click', openSetup);
elements.btnMinimize?.addEventListener('click', async () => {
  await window.electronAPI.minimizeWindow();
});

elements.settingsModal?.addEventListener('click', (e) => {
  if (e.target === elements.settingsModal) {
    closeSettings();
  }
});

// Initialize
refreshStatus();
setInterval(refreshStatus, 10000);
