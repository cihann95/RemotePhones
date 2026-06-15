// =====================================================
// PHONE FARM V2 - PRE-FLIGHT VALIDATION MODULE
// Startup checks before app fully launches
// =====================================================

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const net = require('net');

/**
 * Get the project root directory
 */
function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

/**
 * Check if ADB binary is available on the system PATH.
 * Runs `adb version` and checks exit code.
 */
function checkAdbBinary() {
  try {
    cp.execSync('adb version', { stdio: 'pipe', timeout: 5000 });
    return {
      name: 'adb-binary',
      status: 'ok',
      message: 'ADB binary sistemde mevcut.',
      fix_steps: []
    };
  } catch (e) {
    return {
      name: 'adb-binary',
      status: 'error',
      message: 'ADB binary sistemde bulunamadı.',
      fix_steps: [
        '1. Android platform-tools\'u indirin: https://developer.android.com/studio/releases/platform-tools',
        '2. İndirilen klasörü PATH\'e ekleyin.',
        '3. Terminal\'de `adb version` yazarak doğrulayın.',
        '4. Bilgisayarı yeniden başlatın.'
      ]
    };
  }
}

/**
 * Check if the phone_farm_cli binary or Python script exists.
 */
function checkCliBinary() {
  const projectRoot = getProjectRoot();

  // Check for PyInstaller-built binary in dist/
  const cliBinary = process.platform === 'win32'
    ? path.join(projectRoot, 'dist', 'phone_farm_cli.exe')
    : path.join(projectRoot, 'dist', 'phone_farm_cli');

  // Check for Python script as fallback
  const cliScript = path.join(projectRoot, 'phone_farm_cli.py');

  if (fs.existsSync(cliBinary)) {
    return {
      name: 'cli-binary',
      status: 'ok',
      message: 'phone_farm_cli binary\'si mevcut.',
      fix_steps: []
    };
  }

  if (fs.existsSync(cliScript)) {
    return {
      name: 'cli-binary',
      status: 'ok',
      message: 'phone_farm_cli.py betiği mevcut.',
      fix_steps: []
    };
  }

  return {
    name: 'cli-binary',
    status: 'error',
    message: 'phone_farm_cli bulunamadı.',
    fix_steps: [
      '1. Proje dizininde olduğunuzdan emin olun.',
      '2. `python phone_farm_cli.py` komutunun çalıştığını doğrulayın.',
      '3. PyInstaller ile binary oluşturmak için `pyinstaller phone_farm_cli.spec` çalıştırın.',
      '4. Veya doğrudan Python betiğini kullanın: `python phone_farm_cli.py`.'
    ]
  };
}

/**
 * Check if .env file exists; if .env.example exists, offer auto-copy guidance.
 */
function checkEnvFile() {
  const projectRoot = getProjectRoot();
  const envPath = path.join(projectRoot, '.env');
  const envExamplePath = path.join(projectRoot, '.env.example');

  if (fs.existsSync(envPath)) {
    return {
      name: 'env-file',
      status: 'ok',
      message: '.env dosyası mevcut.',
      fix_steps: []
    };
  }

  if (fs.existsSync(envExamplePath)) {
    return {
      name: 'env-file',
      status: 'error',
      message: '.env dosyası bulunamadı. .env.example mevcut, kopyalanabilir.',
      fix_steps: [
        '1. Terminal\'de şu komutu çalıştırın: cp .env.example .env',
        '2. .env dosyasını kendi ortamınıza göre düzenleyin.',
        '3. API_SECRET_KEY gibi zorunlu alanları doldurun.'
      ]
    };
  }

  return {
    name: 'env-file',
    status: 'error',
    message: '.env ve .env.example dosyaları bulunamadı.',
    fix_steps: [
      '1. Proje kök dizininde .env dosyası oluşturun.',
      '2. Gerekli değişkenleri ekleyin: API_SECRET_KEY, DATA_DIR, CORS_ORIGINS.',
      '3. Örnek için .env.example dosyasını inceleyin.'
    ]
  };
}

/**
 * Check if required Python dependencies are importable.
 * Tries to import key packages without running a full Python script.
 */
function checkPythonDeps() {
  const requiredPackages = [
    'fastapi',
    'uvicorn',
    'yaml',
    'PIL',
    'requests'
  ];

  const missing = [];
  const found = [];

  for (const pkg of requiredPackages) {
    try {
      cp.execSync(
        `python -c "import ${pkg}" 2>&1 || python3 -c "import ${pkg}" 2>&1`,
        { stdio: 'pipe', timeout: 5000 }
      );
      found.push(pkg);
    } catch (e) {
      // Try python3 as fallback
      try {
        cp.execSync(
          `python3 -c "import ${pkg}" 2>&1`,
          { stdio: 'pipe', timeout: 5000 }
        );
        found.push(pkg);
      } catch (e2) {
        missing.push(pkg);
      }
    }
  }

  const reqPath = path.join(getProjectRoot(), 'requirements.txt');

  if (missing.length === 0) {
    return {
      name: 'python-deps',
      status: 'ok',
      message: 'Gerekli Python paketleri mevcut.',
      fix_steps: []
    };
  }

  return {
    name: 'python-deps',
    status: 'error',
    message: `Eksik Python paketleri: ${missing.join(', ')}`,
    fix_steps: [
      `1. Terminal'de şu komutu çalıştırın: pip install -r requirements.txt`,
      `2. Eksik paketleri tek tek yükleyin: pip install ${missing.join(' ')}`,
      `3. Sanal ortam kullanıyorsanız aktif olduğundan emin olun.`,
      fs.existsSync(reqPath) ? '' : `4. requirements.txt dosyası bulunamadı: ${reqPath}`
    ].filter(Boolean)
  };
}

/**
 * Check if the data directory exists and is writable.
 */
function checkDataDir() {
  const projectRoot = getProjectRoot();
  const dataDir = path.join(projectRoot, 'data');

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    // Test write access
    const testFile = path.join(dataDir, '.preflight-write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return {
      name: 'data-dir',
      status: 'ok',
      message: 'Veri dizini mevcut ve yazılabilir durumda.',
      fix_steps: []
    };
  } catch (e) {
    return {
      name: 'data-dir',
      status: 'error',
      message: `Veri dizinine yazılamıyor: ${dataDir}`,
      fix_steps: [
        '1. Dizinin var olduğundan emin olun: mkdir -p data',
        '2. Dizin izinlerini kontrol edin: chmod 755 data',
        `3. Geçerli kullanıcının dizine yazma izni olduğundan emin olun.`,
        `4. Disk alanını kontrol edin: df -h`
      ]
    };
  }
}

/**
 * Check if port 8000 (monitor API) is available.
 */
function checkPortAvailability() {
  return new Promise((resolve) => {
    const server = net.createServer();
    let portFree = false;

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          name: 'port-8000',
          status: 'warning',
          message: '8000 numaralı port şu anda kullanımda (monitor API zaten çalışıyor olabilir).',
          fix_steps: [
            '1. Portu kullanan işlemi bulun: lsof -i :8000',
            '2. Gerekirse işlemi sonlandırın: kill -9 <PID>',
            '3. Veya monitor API\'nin zaten çalıştığından emin olun.'
          ]
        });
      } else {
        resolve({
          name: 'port-8000',
          status: 'warning',
          message: `Port 8000 kontrol edilemiyor: ${err.message}`,
          fix_steps: [
            '1. Başka bir port kullanmayı deneyin.',
            '2. Güvenlik duvarı ayarlarınızı kontrol edin.'
          ]
        });
      }
    });

    server.once('listening', () => {
      portFree = true;
      server.close(() => {
        resolve({
          name: 'port-8000',
          status: 'ok',
          message: '8000 numaralı port kullanıma hazır.',
          fix_steps: []
        });
      });
    });

    server.listen(8000, '127.0.0.1');
  });
}

/**
 * Check available disk space (minimum 100 MB free).
 */
function checkDiskSpace() {
  try {
    const projectRoot = getProjectRoot();
    let freeBytes = 0;

    if (fs.statfsSync) {
      const stats = fs.statfsSync(projectRoot);
      freeBytes = stats.bsize * stats.bfree;
    } else {
      // Fallback: check platform-specific
      const platform = process.platform;
      if (platform === 'win32') {
        const drive = projectRoot.split(':')[0] + ':';
        const output = cp.execSync(`wmic logicaldisk where "deviceid='${drive}'" get freespace`, {
          stdio: 'pipe',
          timeout: 5000
        }).toString();
        const lines = output.trim().split('\n');
        if (lines.length >= 2) {
          freeBytes = parseInt(lines[1].trim(), 10);
        }
      } else {
        // Unix: use df
        const output = cp.execSync(`df -k "${projectRoot}" | tail -1 | awk '{print $4}'`, {
          stdio: 'pipe',
          timeout: 5000
        }).toString().trim();
        freeBytes = parseInt(output, 10) * 1024; // df -k gives kilobytes
      }
    }

    const freeMB = freeBytes / (1024 * 1024);
    const thresholdMB = 100;

    if (freeMB >= thresholdMB) {
      return {
        name: 'disk-space',
        status: 'ok',
        message: `Diskte yeterli alan var: ${freeMB.toFixed(0)} MB boş.`,
        fix_steps: []
      };
    }

    return {
      name: 'disk-space',
      status: 'warning',
      message: `Disk alanı düşük: ${freeMB.toFixed(0)} MB boş. En az ${thresholdMB} MB gerekli.`,
      fix_steps: [
        `1. Gereksiz dosyaları temizleyin.`,
        `2. En az ${thresholdMB} MB boş alan bırakın.`,
        `3. Disk temizleme aracı çalıştırın.`
      ]
    };
  } catch (e) {
    return {
      name: 'disk-space',
      status: 'warning',
      message: 'Disk alanı kontrol edilemedi.',
      fix_steps: [
        '1. Disk alanını manuel kontrol edin.',
        '2. En az 100 MB boş alan bırakın.'
      ]
    };
  }
}

/**
 * Run all pre-flight checks and return aggregated results.
 * @returns {Promise<{ok: boolean, checks: Array, summary: string}>}
 */
async function runPreflightChecks() {
  // Synchronous checks
  const syncChecks = [
    checkAdbBinary(),
    checkCliBinary(),
    checkEnvFile(),
    checkPythonDeps(),
    checkDataDir(),
    checkDiskSpace()
  ];

  // Asynchronous checks
  const asyncChecks = await Promise.all([
    checkPortAvailability()
  ]);

  const checks = [...syncChecks, ...asyncChecks];

  const total = checks.length;
  const okCount = checks.filter(c => c.status === 'ok').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  const errorCount = checks.filter(c => c.status === 'error').length;

  // Only errors make the overall result fail; warnings are informational
  const allPassed = errorCount === 0;

  let summary;
  if (allPassed) {
    if (warningCount > 0) {
      summary = `✅ ${okCount}/${total} kontrol başarılı, ${warningCount} uyarı var.`;
    } else {
      summary = `✅ Tüm kontroller başarılı (${okCount}/${total}).`;
    }
  } else {
    summary = `❌ ${errorCount} kritik hata bulundu (${okCount}/${total} başarılı, ${warningCount} uyarı).`;
  }

  return { ok: allPassed, checks, summary };
}

module.exports = { runPreflightChecks };
