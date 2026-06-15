/**
 * Tests for preflight validation module.
 * Uses vi.spyOn on cached Node built-ins instead of vi.mock
 * (which doesn't support CJS Node built-in mocking in this setup).
 */

const cp = require('child_process');
const fs = require('fs');

describe('preflight module', () => {
  let preflight;

  beforeEach(() => {
    // Spy on cached Node built-ins BEFORE loading the module
    vi.spyOn(cp, 'execSync').mockImplementation((cmd) => {
      // Default: all commands succeed
      return Buffer.from('');
    });
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      // Default: most files exist
      if (filePath.includes('dist/phone_farm_cli') && !filePath.includes('.exe')) return true;
      if (filePath.includes('phone_farm_cli.py')) return false; // prefer binary
      if (filePath.endsWith('.env') && !filePath.endsWith('.env.example')) return true;
      if (filePath.includes('.env.example')) return true;
      if (filePath.includes('requirements.txt')) return true;
      return true;
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    if (fs.statfsSync) {
      vi.spyOn(fs, 'statfsSync').mockImplementation(() => ({
        bsize: 4096,
        bfree: 25600000  // ~100 GB free
      }));
    }

    // Reload module to get fresh mocks
    delete require.cache[require.resolve('../main/preflight')];
    preflight = require('../main/preflight');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runPreflightChecks', () => {
    it('should return ok=true when all checks pass', async () => {
      const result = await preflight.runPreflightChecks();

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThanOrEqual(6);
      expect(typeof result.summary).toBe('string');
    });

    it('should include all required check names', async () => {
      const result = await preflight.runPreflightChecks();
      const names = result.checks.map(c => c.name);

      expect(names).toContain('adb-binary');
      expect(names).toContain('cli-binary');
      expect(names).toContain('env-file');
      expect(names).toContain('python-deps');
      expect(names).toContain('data-dir');
      expect(names).toContain('disk-space');
    });

    it('should return ok=false when ADB binary is missing', async () => {
      // Only ADB check fails
      cp.execSync.mockImplementation((cmd) => {
        if (cmd === 'adb version') throw new Error('command not found');
        return Buffer.from('');
      });

      const result = await preflight.runPreflightChecks();
      expect(result.ok).toBe(false);

      const adbCheck = result.checks.find(c => c.name === 'adb-binary');
      expect(adbCheck.status).toBe('error');
      expect(adbCheck.message).toContain('bulunamadı');
      expect(adbCheck.fix_steps.length).toBeGreaterThan(0);
    });

    it('should detect missing .env file', async () => {
      // .env missing, .env.example exists
      fs.existsSync.mockImplementation((filePath) => {
        if (filePath.includes('phone_farm_cli')) return true;
        if (filePath.endsWith('.env') && !filePath.endsWith('.env.example')) return false;
        if (filePath.endsWith('.env.example')) return true;
        if (filePath.includes('requirements.txt')) return true;
        return true;
      });

      const result = await preflight.runPreflightChecks();
      const envCheck = result.checks.find(c => c.name === 'env-file');
      expect(envCheck.status).toBe('error');
      expect(envCheck.message).toContain('.env');
    });
  });

  describe('individual checks', () => {
    it('should report ADB check as error when execSync throws', async () => {
      cp.execSync.mockImplementation((cmd) => {
        if (cmd === 'adb version') throw new Error('Not found');
        return Buffer.from('');
      });

      const result = await preflight.runPreflightChecks();
      const check = result.checks.find(c => c.name === 'adb-binary');
      expect(check.status).toBe('error');
      expect(check.fix_steps.length).toBeGreaterThan(0);
    });

    it('should report CLI binary missing when file not found', async () => {
      fs.existsSync.mockImplementation((filePath) => {
        if (filePath.includes('phone_farm_cli')) return false;
        if (filePath.endsWith('.env')) return true;
        if (filePath.includes('requirements.txt')) return true;
        return true;
      });

      const result = await preflight.runPreflightChecks();
      const check = result.checks.find(c => c.name === 'cli-binary');
      expect(check.status).toBe('error');
    });

    it('should report Python deps missing when imports fail', async () => {
      // Simulate ALL python import commands failing
      cp.execSync.mockImplementation((cmd) => {
        if (cmd.includes('python') || cmd.includes('python3')) {
          throw new Error('Module not found');
        }
        return Buffer.from('');
      });

      const result = await preflight.runPreflightChecks();
      const check = result.checks.find(c => c.name === 'python-deps');
      expect(check.status).toBe('error');
      expect(check.fix_steps.length).toBeGreaterThan(0);
    });

    it('should report data dir as ok when write succeeds', async () => {
      const result = await preflight.runPreflightChecks();
      const check = result.checks.find(c => c.name === 'data-dir');
      expect(check.status).toBe('ok');
    });

    it('should report data dir error when write fails', async () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await preflight.runPreflightChecks();
      const check = result.checks.find(c => c.name === 'data-dir');
      expect(check.status).toBe('error');
      expect(check.fix_steps.length).toBeGreaterThan(0);
    });

    it('should produce Turkish messages for all checks', async () => {
      const result = await preflight.runPreflightChecks();
      const turkishKeywords = [
        'mevcut', 'bulunamadı', 'hazır', 'kontrol', 'başarılı',
        'dosyası', 'dizini', 'yazılabilir', 'yeterli', 'kullanımda',
        'gerekli', 'sistemde', 'numaralı', 'port', 'eksik',
        'disk', 'alan', 'python'
      ];

      for (const check of result.checks) {
        expect(check.message).toBeTruthy();
        const messageLower = check.message.toLowerCase();
        const isTurkish = turkishKeywords.some(kw => messageLower.includes(kw));
        expect(isTurkish).toBe(true);
      }
    });

    it('should provide fix steps for error checks', async () => {
      // Make ADB fail
      cp.execSync.mockImplementation((cmd) => {
        if (cmd === 'adb version') throw new Error('Not found');
        return Buffer.from('');
      });

      const result = await preflight.runPreflightChecks();
      const errorChecks = result.checks.filter(c => c.status === 'error');
      for (const check of errorChecks) {
        expect(Array.isArray(check.fix_steps)).toBe(true);
        expect(check.fix_steps.length).toBeGreaterThan(0);
      }
    });
  });
});
