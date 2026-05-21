// =====================================================
// PHONE FARM V2 - MODE SELECTION RENDERER
// =====================================================

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
      alert(remoteCheck.reason || 'Uzaktan erisim bu lisansta aktif degil');
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
    if (typeof process !== 'undefined') console.log('License info:', licenseInfo);

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
        <span>Telefon: ${licenseInfo.maxPhones}</span>
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

  const confirmed = confirm(
    'Lisansi deaktive etmek istediginizden emin misiniz?\n\n' +
    'Bu islem geri alinamaz ve uygulamayi tekrar kullanmak icin yeni bir lisans anahtari girmeniz gerekecek.'
  );

  if (!confirmed) {
    return;
  }

  btn.disabled = true;

  try {
    const result = await window.electronAPI.deactivateLicense();
    if (typeof process !== 'undefined') console.log('Deactivation result:', result);

    if (result.success) {
      alert('Lisans basariyla deaktive edildi. Uygulama lisans ekranina yonlendirilecek.');
      // Reload to license page
      window.location.href = 'license.html';
    } else {
      alert('Lisans deaktive edilemedi: ' + (result.error || 'Bilinmeyen hata'));
    }
  } catch (error) {
    console.error('Deactivation error:', error);
    alert('Lisans deaktive edilirken hata olustu: ' + error.message);
  } finally {
    btn.disabled = false;
  }
});

// Initial check
checkStatus();
checkLicenseInfo();

// Periodic status check
setInterval(checkStatus, 10000);
