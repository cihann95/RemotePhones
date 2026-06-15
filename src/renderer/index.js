// =====================================================
// PHONE FARM V2 - MODE SELECTION RENDERER
// =====================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// License info cache
let licenseInfo = null;

// Mode selection
document.getElementById('mode-home').addEventListener('click', async () => {
  try {
    await window.electronAPI.selectMode('home');
  } catch (e) {
    console.error('Select mode (home) error:', e);
  }
});

document.getElementById('mode-office').addEventListener('click', async () => {
  try {
    // Check if remote access is allowed
    const remoteCheck = await window.electronAPI.isRemoteAccessAllowed();
    if (!remoteCheck.allowed) {
      PhoneFarmNotification.show(remoteCheck.reason || 'Remote access is not enabled for this license.', 'warning');
      return;
    }
    await window.electronAPI.selectMode('office');
  } catch (e) {
    console.error('Select mode (office) error:', e);
  }
});

// Status check
async function checkStatus() {
  try {
    const status = await window.electronAPI.getFullStatus();

    // Tailscale
    const tailscaleEl = document.getElementById('tailscale-status');
    if (status.tailscale.loggedIn) {
      tailscaleEl.innerHTML = `<span class="status-badge status-online">Bagli</span>`;
    } else if (status.tailscale.running) {
      tailscaleEl.innerHTML = `<span class="status-badge status-warning">Giris Gerekli</span>`;
    } else if (status.tailscale.installed) {
      tailscaleEl.innerHTML = `<span class="status-badge status-warning">Calismiyor</span>`;
    } else {
      tailscaleEl.innerHTML = `<span class="status-badge status-offline">Kurulu Degil</span>`;
    }

    // Parsec
    const parsecEl = document.getElementById('parsec-status');
    if (status.parsec.loggedIn) {
      parsecEl.innerHTML = `<span class="status-badge status-online">Hazir</span>`;
    } else if (status.parsec.running) {
      parsecEl.innerHTML = `<span class="status-badge status-warning">Giris Gerekli</span>`;
    } else if (status.parsec.installed) {
      parsecEl.innerHTML = `<span class="status-badge status-warning">Calismiyor</span>`;
    } else {
      parsecEl.innerHTML = `<span class="status-badge status-offline">Kurulu Degil</span>`;
    }
  } catch (e) {
    console.error('Status check error:', e);
  }
}

// Check license info and update UI
async function checkLicenseInfo() {
  try {
    licenseInfo = await window.electronAPI.getLicenseInfo();

    // Validate licenseInfo is a non-null object with expected fields
    if (!licenseInfo || typeof licenseInfo !== 'object') {
      licenseInfo = { remoteAccess: false, maxPhones: 5 };
    } else {
      // Apply defensive defaults for missing/null/undefined fields
      if (licenseInfo.remoteAccess === null || licenseInfo.remoteAccess === undefined) {
        licenseInfo.remoteAccess = false;
      }
      if (licenseInfo.maxPhones === null || licenseInfo.maxPhones === undefined) {
        licenseInfo.maxPhones = 5;
      }
    }

    // Update license display if element exists
    const licenseEl = document.getElementById('license-info');
    if (licenseEl) {
      licenseEl.innerHTML = `
        <span>Telefon: ${escapeHtml(String(licenseInfo.maxPhones || ''))}</span>
        <span class="footer-divider"></span>
        <span>Uzaktan: ${licenseInfo.remoteAccess ? 'Aktif' : 'Pasif'}</span>
      `;
    }

    // Disable office button if remote access not allowed
    const officeBtn = document.getElementById('mode-office');
    if (officeBtn && !licenseInfo.remoteAccess) {
      officeBtn.classList.add('disabled');
      officeBtn.title = 'Uzaktan erisim bu lisansta aktif degil';
    }
  } catch (e) {
    // Fall back to safe defaults on any error
    licenseInfo = { remoteAccess: false, maxPhones: 5 };
    console.error('License info error:', e);
  }
}

// Deactivate license button handler
document.getElementById('btn-deactivate-license').addEventListener('click', async () => {
  const btn = document.getElementById('btn-deactivate-license');

  window.PhoneFarmConfirmModal.show({
    title: 'Lisans Deaktivasyonu',
    message: 'Lisansi deaktive etmek istediginizden emin misiniz?\n\nBu islem geri alinamaz ve uygulamayi tekrar kullanmak icin yeni bir lisans anahtari girmeniz gerekecek.',
    onConfirm: async () => {
      btn.disabled = true;

      try {
        const result = await window.electronAPI.deactivateLicense();

        if (result.success) {
          PhoneFarmNotification.show('License deactivated successfully. Redirecting to license page.', 'success');
          window.location.href = 'license.html';
        } else {
          PhoneFarmNotification.show('License could not be deactivated: ' + (result.error || 'Unknown error'), 'error');
        }
} catch (error) {
    console.error('Deactivation error:', error);
    const h = await window.electronAPI.humanizeError(error.message || String(error));
    PhoneFarmNotification.show(h.title + ': ' + h.hint, 'error');
  } finally {
        btn.disabled = false;
      }
    }
  });
});

// Initial check
checkStatus();
checkLicenseInfo();

// Periodic status check
setInterval(checkStatus, 10000);
