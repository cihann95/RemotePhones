// =====================================================
// PHONE FARM V2 - LICENSE RENDERER
// =====================================================

// DOM Elements
const elements = {
  licenseKey: document.getElementById('license-key'),
  btnActivate: document.getElementById('btn-activate'),
  btnContinue: document.getElementById('btn-continue'),
  btnDeactivate: document.getElementById('btn-deactivate'),
  errorMessage: document.getElementById('error-message'),
  successMessage: document.getElementById('success-message'),
  licenseInfo: document.getElementById('license-info'),
  activationForm: document.getElementById('activation-form'),
  loadingSpinner: document.getElementById('loading-spinner'),
  infoStatus: document.getElementById('info-status'),
  infoKey: document.getElementById('info-key'),
  infoExpiry: document.getElementById('info-expiry'),
  infoPhones: document.getElementById('info-phones'),
  infoRemote: document.getElementById('info-remote')
};

// State
let isLoading = false;

// Initialize
async function init() {
  // Check current license status
  await checkLicenseStatus();

  // Event listeners
  elements.btnActivate.addEventListener('click', handleActivate);
  elements.btnContinue.addEventListener('click', handleContinue);
  elements.btnDeactivate.addEventListener('click', handleDeactivate);

  // Enter key to activate
  elements.licenseKey.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !isLoading) {
      handleActivate();
    }
  });

  // Auto-format license key (Cryptlex format: 6 groups of 6 hex chars)
  elements.licenseKey.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '');
    let formatted = '';
    // Cryptlex keys: 6 groups of 6 characters = 36 chars max
    for (let i = 0; i < value.length && i < 36; i++) {
      if (i > 0 && i % 6 === 0) {
        formatted += '-';
      }
      formatted += value[i];
    }
    e.target.value = formatted;
  });
}

// Check license status
async function checkLicenseStatus() {
  setLoading(true);
  hideMessages();

  try {
    const result = await window.electronAPI.checkLicense();

    if (result.isValid) {
      showActivatedState(result);
    } else {
      showDeactivatedState(result.error);
    }
  } catch (error) {
    console.error('License check error:', error);
    const h = await window.electronAPI.humanizeError(error.message || String(error));
    showDeactivatedState(h.title + ': ' + h.hint);
  } finally {
    setLoading(false);
  }
}

// Handle activate button
async function handleActivate() {
  const licenseKeyValue = elements.licenseKey.value.trim();

  if (!licenseKeyValue) {
    showError('Lutfen lisans anahtarini girin');
    return;
  }

  setLoading(true);
  hideMessages();

  try {
    const result = await window.electronAPI.activateLicense(licenseKeyValue);

    if (result.success) {
      showSuccess('Lisans basariyla aktiflestirildi!');
      showActivatedState(result.licenseStatus);
    } else {
      showError(result.error || 'Aktivasyon basarisiz');
    }
  } catch (error) {
    console.error('Activation error:', error);
    const h = await window.electronAPI.humanizeError(error.message || 'Aktivasyon sirasinda hata olustu');
    showError(h.title + ': ' + h.hint);
  } finally {
    setLoading(false);
  }
}

// Handle continue button
async function handleContinue() {
  try {
    await window.electronAPI.licenseActivated();
  } catch (error) {
    console.error('Continue error:', error);
  }
}

// Handle deactivate button
async function handleDeactivate() {
  window.PhoneFarmConfirmModal.show({
    title: 'Lisans Deaktivasyonu',
    message: 'Lisansi deaktif etmek istediginizden emin misiniz?',
    onConfirm: async () => {
      setLoading(true);
      hideMessages();

      try {
        const result = await window.electronAPI.deactivateLicense();

        if (result.success) {
          showSuccess('Lisans deaktif edildi');
          showDeactivatedState();
        } else {
          showError(result.error || 'Deaktivasyon basarisiz');
        }
} catch (error) {
    console.error('Deactivation error:', error);
    const h = await window.electronAPI.humanizeError(error.message || 'Deaktivasyon sirasinda hata olustu');
    showError(h.title + ': ' + h.hint);
  } finally {
        setLoading(false);
      }
    }
  });
}

// Show activated state
function showActivatedState(licenseInfo) {
  // Hide activation form
  elements.activationForm.classList.add('hidden');
  elements.btnActivate.classList.add('hidden');

  // Show license info
  elements.licenseInfo.classList.add('show');
  elements.btnContinue.classList.remove('hidden');
  elements.btnDeactivate.classList.remove('hidden');

  // Update info display
  elements.infoStatus.innerHTML = '<span class="feature-badge enabled">Aktif</span>';

  if (licenseInfo.licenseKey) {
    elements.infoKey.textContent = '***' + licenseInfo.licenseKey.slice(-8);
  } else {
    elements.infoKey.textContent = '-';
  }

  if (licenseInfo.expiryDate) {
    const expiry = new Date(licenseInfo.expiryDate);
    elements.infoExpiry.textContent = expiry.toLocaleDateString('tr-TR');
  } else {
    elements.infoExpiry.textContent = 'Sinirsiz';
  }

  elements.infoPhones.textContent = licenseInfo.maxPhones || 5;

  if (licenseInfo.remoteAccess) {
    elements.infoRemote.innerHTML = '<span class="feature-badge enabled">Aktif</span>';
  } else {
    elements.infoRemote.innerHTML = '<span class="feature-badge disabled">Pasif</span>';
  }
}

// Show deactivated state
function showDeactivatedState(errorMsg) {
  // Show activation form
  elements.activationForm.classList.remove('hidden');
  elements.btnActivate.classList.remove('hidden');

  // Hide license info
  elements.licenseInfo.classList.remove('show');
  elements.btnContinue.classList.add('hidden');
  elements.btnDeactivate.classList.add('hidden');

  // Clear input
  elements.licenseKey.value = '';

  // Show error if provided
  if (errorMsg && errorMsg !== 'Lisans bulunamadi') {
    // Check if it's a VC++ Runtime error
    if (errorMsg.includes('modulu yuklenemedi') || errorMsg.includes('Visual C++')) {
      showVCRuntimeError(errorMsg);
    } else {
      showError(errorMsg);
    }
  }
}

// Show VC++ Runtime error with download link
function showVCRuntimeError(errorMsg) {
  const vcDownloadUrl = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
  elements.errorMessage.innerHTML = `
    <strong>Lisans Sistemi Baslatilamadi</strong><br>
    <span style="font-size: 0.9em;">Visual C++ Runtime gerekli olabilir.</span><br><br>
    <a href="#" id="vc-download-link"
       style="color: #60a5fa; text-decoration: underline;">
       Visual C++ Runtime Indir (x64)
    </a>
    <br><br>
    <span style="font-size: 0.8em; color: #888;">Indirdikten sonra kurun ve uygulamayi yeniden baslatin.</span>
  `;
  const vcLink = document.getElementById('vc-download-link');
  if (vcLink) {
    vcLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.electronAPI.openExternal(vcDownloadUrl);
    });
  }
  elements.errorMessage.classList.add('show');
  elements.successMessage.classList.remove('show');
}

// Set loading state
function setLoading(loading) {
  isLoading = loading;
  elements.btnActivate.disabled = loading;
  elements.btnDeactivate.disabled = loading;
  elements.licenseKey.disabled = loading;

  if (loading) {
    elements.loadingSpinner.classList.add('show');
    elements.btnActivate.textContent = 'Yukleniyor...';
  } else {
    elements.loadingSpinner.classList.remove('show');
    elements.btnActivate.textContent = 'Lisansi Aktiflestir';
  }
}

// Show error message
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.add('show');
  elements.successMessage.classList.remove('show');
}

// Show success message
function showSuccess(message) {
  elements.successMessage.textContent = message;
  elements.successMessage.classList.add('show');
  elements.errorMessage.classList.remove('show');
}

// Hide all messages
function hideMessages() {
  elements.errorMessage.classList.remove('show');
  elements.successMessage.classList.remove('show');
}

// Initialize on load
init();
