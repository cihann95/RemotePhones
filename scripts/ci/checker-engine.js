'use strict';

const fs = require('fs');
const path = require('path');
const { execFile: execFile_cp } = require('child_process');
const { promisify } = require('util');
const execFile = promisify(execFile_cp);

/**
 * ── helpers ──────────────────────────────────────────────────────────────────
 */

const CONFIG_PATH = path.join(__dirname, 'checker-config.json');

function rel(p, rootDir) {
  return path.resolve(rootDir, p);
}

function safeRel(p, rootDir) {
  const r = rel(p, rootDir);
  try { return path.relative(rootDir, r); } catch { return r; }
}

function walkProjectJsFiles(rootDir) {
  const exclude = new Set([
    'node_modules',
    path.join('dist', 'win-unpacked', 'resources', 'app', 'node_modules'),
    'empty_dir',
  ]);

  const result = [];
  function walk(dir) {
    const entries = [];
    try { entries.push(...fs.readdirSync(dir, { withFileTypes: true })); }
    catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Skip the dist/…/node_modules path
        const relName = path.relative(rootDir, full);
        let excluded = false;
        for (const token of exclude) {
          if (relName === token || relName.startsWith(token + path.sep)) { excluded = true; break; }
        }
        if (!excluded) walk(full);
      } else if (e.isFile() && e.name.endsWith('.js')) {
        result.push(full);
      }
    }
  }
  walk(rootDir);
  return result;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (_) { /* fall back to defaults */ }
  return {};
}

/**
 * ── 1. Syntax Check ─────────────────────────────────────────────────────────
 */
async function runSyntaxCheck(filePaths, _rootDir, config) {
  const findings = [];
  const concurrentLimit = config.concurrency || 8;
  const timeout = config.syntaxTimeoutMs || 15000;
  let i = 0;

  async function worker() {
    while (i < filePaths.length) {
      const fp = filePaths[i++];
      try {
        await new Promise((resolve) => {
          const p = execFile('node', ['--check', fp], { timeout }, (err, stdout, stderr) => {
            if (stderr) {
              const lines = stderr.trim().split('\n').filter(Boolean);
              for (const ln of lines) {
                const m = ln.match(/(?:^|:)([^:]+?):(\d+):/);
                const lineNum = m ? parseInt(m[2], 10) : 1;
                findings.push({
                  id: `syntax-${path.basename(fp)}-${lineNum}`,
                  severity: 'critical',
                  file: safeRel(fp, getCurrentRootDir()),
                  line: lineNum,
                  message: `Syntax error: ${ln}`,
                  suggestion: 'Fix the JS syntax error before proceeding.',
                });
              }
            }
            resolve();
          });
          if (err && !err.killed) { /* already captured via stderr */ }
        });
      } catch (e) {
        // timeout or other exec error — still record if stderr was produced
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrentLimit, filePaths.length) }, worker);
  await Promise.all(workers);
  return findings;
}

// store rootDir globally for helper above (set in runAllChecks)
let _currentRootDir;
function getCurrentRootDir() { return _currentRootDir; }

/**
 * ── 2. NPM Audit ───────────────────────────────────────────────────────────
 */
async function runNpmAudit(rootDir) {
  const findings = [];
  try {
    const { stdout, stderr } = await execFile('npm', ['audit', '--json', '--audit-level=moderate'], {
      cwd: rootDir,
      timeout: 60000,
    });
    let data;
    try { data = JSON.parse(stdout || '{}'); } catch (_) { data = {}; }
    if (data.vulnerabilities) {
      for (const [pkg, vuln] of Object.entries(data.vulnerabilities)) {
        const sev = vuln.severity || 'moderate';
        const sevMap = { critical: 'critical', high: 'high', moderate: 'medium', low: 'low', info: 'low' };
        findings.push({
          id: `npm-audit-${pkg}`,
          severity: sevMap[sev] || 'medium',
          file: 'package.json',
          line: 1,
          message: `Vulnerability in ${pkg}: ${vuln.title || 'unknown'} (${sev})`,
          suggestion: `Run 'npm audit fix' or update ${pkg} to a safe version.`,
        });
      }
    }
  } catch (e) {
    // npm audit fails gracefully if no lockfile or incompatible npm version
    if (e.stderr) {
      findings.push({
        id: 'npm-audit-setup',
        severity: 'low',
        file: 'package.json',
        line: 1,
        message: `npm audit could not run: ${String(e.stderr || e.message).slice(0, 200)}`,
        suggestion: 'Ensure package-lock.json exists and npm is up to date.',
      });
    }
  }
  return findings;
}

/**
 * ── 3. Dead Import Detector ────────────────────────────────────────────────
 */
async function runDeadImportDetector(filePaths, _rootDir, config) {
  const findings = [];
  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    // Collect all named import names (both CommonJS and ESM)
    const importNames = []; // {name, line}
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li].trim();
      // const X = require('Y')
      const m1 = raw.match(/^const\s+(\w+)\s*=/);
      // import X from 'Y'  |  import X from "Y"
      const m2 = raw.match(/^import\s+(\w+)\s+from\s+['"`]/);
      // import { X } from 'Y'
      const m3 = raw.match(/^import\s+\{(\s*\w+[\s\S]*?)\}\s+from\s+['"`]/);
      if (m2 || m1) {
        importNames.push({ name: ((m1 || m2))[1], line: li + 1 });
      } else if (m3) {
        const names = m3[1].split(',').map(s => s.trim().split(/\s+/)[0].replace(/\s*as\s+\w+.*$/,'').trim()).filter(Boolean);
        for (const n of names) importNames.push({ name: n, line: li + 1 });
      }
    }
    // Check usage — strip string contents before testing for usage
    const textNoStrings = text.replace(/(["'`])(?:[\s\S]*?)\1/g, '');
    for (const imp of importNames) {
      const name = imp.name;
      // Build a safe regex for the identifier
      const re = new RegExp(`\\b${name}\\b`);
      // Find all occurrences
      const allHits = [...textNoStrings.matchAll(re)];
      // Remove the import line itself (it contains the name)
      const usageHits = allHits.filter(m => {
        // Estimate the line number of this match by counting newlines in the substring
        const prefix = textNoStrings.slice(0, m.index);
        const matchLine = prefix.split('\n').length;
        return Math.abs(matchLine - imp.line) > 1; // not on import line
      });
      if (usageHits.length === 0) {
        findings.push({
          id: `dead-import-${path.basename(fp)}-${imp.line}`,
          severity: 'medium',
          file: safeRel(fp, getCurrentRootDir()),
          line: imp.line,
          message: `Unused import '${name}'`,
          suggestion: `Remove unused import '${name}' or reference it in the code.`,
        });
      }
    }
  }
  return findings;
}

/**
 * ── 4. Unguarded Log Detector ───────────────────────────────────────────────
 */
async function runUnguardedLogDetector(filePaths, _rootDir, config) {
  const findings = [];
  const LOG_RE = /\b(console\.log|console\.error|console\.warn|console\.info)\s*\(/g;
  const GUARD_RE = /(process\.env\.[A-Z_]*DEBUG|if\b[\s\S]*?DEBUG)/;
  const window = config.debugGuardWindowChars || 500;

  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    let m;
    while ((m = LOG_RE.exec(text)) !== null) {
      const hitIdx = m.index;
      const prefix = text.slice(Math.max(0, hitIdx - window), hitIdx);
      if (!GUARD_RE.test(prefix)) {
        const prefixLines = text.slice(0, hitIdx).split('\n');
        const lineNo = prefixLines.length;
        findings.push({
          id: `unguarded-log-${path.basename(fp)}-${lineNo}`,
          severity: 'low',
          file: safeRel(fp, getCurrentRootDir()),
          line: lineNo,
          message: `Unguarded ${m[1]} call (no DEBUG guard in preceding ${window} chars)`,
          suggestion: 'Wrap log statements in a conditional: if (process.env.DEBUG) { … }',
        });
      }
      // Reset Guard lastIndex
      GUARD_RE.lastIndex = 0;
    }
    LOG_RE.lastIndex = 0;
  }
  return findings;
}

/**
 * ── 5. TODO Marker Detector ─────────────────────────────────────────────────
 */
async function runTodoMarkerDetector(filePaths, _rootDir, config) {
  const findings = [];
  const TODO_RE = /\b(TODO|FIXME|HACK|XXX|TEMPORARY|NOQA)\b/g;

  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    // Boolean: is the hit inside a string literal?
    const inStr = (idx) => {
      const before = text.slice(0, idx);
      // Count unescaped quotes of the same type — odd = inside string
      return (before.match(/(^|[^\\])"/g) || []).length % 2 === 1 ||
             (before.match(/(^|[^\\])'/g) || []).length % 2 === 1;
    };
    for (let li = 0; li < lines.length; li++) {
      let m;
      while ((m = TODO_RE.exec(lines[li])) !== null) {
        const globalIdx = text.indexOf(m[0]); // approximate line start – good enough for file-level
        if (!inStr(globalIdx)) {
          findings.push({
            id: `todo-${path.basename(fp)}-${li + 1}-${m[0]}`,
            severity: 'low',
            file: safeRel(fp, getCurrentRootDir()),
            line: li + 1,
            message: `TODO marker found: ${m[0]}`,
            suggestion: `Resolve the ${m[0]} marker or convert it into a tracked issue.`,
          });
        }
        TODO_RE.lastIndex = 0;
      }
      TODO_RE.lastIndex = 0;
    }
  }
  return findings;
}

/**
 * ── 6. IPC Handler Guard Detector ──────────────────────────────────────────
 */
async function runIpcHandlerGuardDetector(filePaths, _rootDir, _config) {
  const findings = [];
  const IPC_RE = /ipcMain\.handle\s*\(/g;

  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    let m;
    while ((m = IPC_RE.exec(text)) !== null) {
      const startIdx = m.index;
      // Number of lines from start to next 50 lines
      const rest = text.slice(startIdx);
      const lines = rest.split('\n').slice(0, 51).join('\n');
      // Check if there's any 'mainWindow.' without isDestroyed() or a null check on the same line/block
      const mainWinLines = lines.match(/^.*mainWindow\..*$/gm) || [];
      for (const hit of mainWinLines) {
        const hasGuard = /(isDestroyed\(\))/.test(hit) ||
                         /(\?\s*mainWindow|mainWindow\s*\?\s*)/.test(hit) ||
                         /(mainWindow\s*!==\s*null)/.test(hit) ||
                         /(mainWindow\s*!==\s*undefined)/.test(hit);
        if (!hasGuard) {
          const lnum = text.slice(0, startIdx).split('\n').length + lines.split('\n').indexOf(hit);
          findings.push({
            id: `ipc-unguarded-${path.basename(fp)}-${lnum}`,
            severity: 'high',
            file: safeRel(fp, getCurrentRootDir()),
            line: lnum,
            message: 'IPC handler accesses `mainWindow.` without isDestroyed() or null check',
            suggestion: 'Guard mainWindow access: if (!mainWindow?.isDestroyed()) { … }',
          });
        }
      }
      IPC_RE.lastIndex = 0;
    }
    IPC_RE.lastIndex = 0;
  }
  return findings;
}

/**
 * ── 7. Process Exit Detector ─────────────────────────────────────────────────
 */
async function runProcessExitDetector(filePaths, allowedFiles, _rootDir, _config) {
  const findings = [];
  const allowedSet = new Set(allowedFiles || []);
  const EXIT_RE = /process\.exit\s*\(/g;

  for (const fp of filePaths) {
    const relName = safeRel(fp, getCurrentRootDir()).toLowerCase();
    if (allowedSet.has(relName.toLowerCase()) || allowedSet.has(fp.toLowerCase())) continue;
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    let m;
    while ((m = EXIT_RE.exec(text)) !== null) {
      const hitLineIdx = text.slice(0, m.index).split('\n').length - 1;
      const windowStart = Math.max(0, hitLineIdx - 6);
      const windowLines = lines.slice(windowStart, hitLineIdx + 1);
      const inCatch = windowLines.some(l => /\btry\b[\s\S]*?\bcatch\b/.test(l));
      // also check the line of the call itself for "try" earlier on same block
      const hasTryCatch = inCatch || windowLines.some(l => /\btry\b/.test(l) && /\bcatch\b/.test(l));
      if (!hasTryCatch) {
        findings.push({
          id: `process-exit-${path.basename(fp)}-${hitLineIdx + 1}`,
          severity: 'high',
          file: safeRel(fp, getCurrentRootDir()),
          line: hitLineIdx + 1,
          message: `process.exit() call not wrapped in try/catch`,
          suggestion: 'Wrap process.exit() in a try/catch block to prevent unhandled exceptions.',
        });
      }
      EXIT_RE.lastIndex = 0;
    }
    EXIT_RE.lastIndex = 0;
  }
  return findings;
}

/**
 * ── 8. Unhandled Promise Detector ───────────────────────────────────────────
 */
async function runUnhandledPromiseDetector(filePaths, _rootDir, _config) {
  const findings = [];
  const THEN_RE = /\.then\s*\(/g;

  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    let m;
    while ((m = THEN_RE.exec(text)) !== null) {
      const hitLineIdx = text.slice(0, m.index).split('\n').length - 1;
      const windowLines = lines.slice(hitLineIdx, hitLineIdx + 11).join('\n');
      if (!/\.catch\s*\(/.test(windowLines)) {
        findings.push({
          id: `unhandled-promise-${path.basename(fp)}-${hitLineIdx + 1}`,
          severity: 'high',
          file: safeRel(fp, getCurrentRootDir()),
          line: hitLineIdx + 1,
          message: `.then() without a .catch() in the following 10 lines`,
          suggestion: 'Append a .catch() handler to handle promise rejections.',
        });
      }
      THEN_RE.lastIndex = 0;
    }
    THEN_RE.lastIndex = 0;
  }
  return findings;
}

/**
 * ── 9. Electron Security Check ──────────────────────────────────────────────
 */
async function runElectronSecurityCheck(filePaths, _rootDir, _config) {
  const findings = [];
  const BW_RE = /new\s+BrowserWindow\s*\(/g;
  const NI_RE = /nodeIntegration\s*:\s*true/g;

  for (const fp of filePaths) {
    let text;
    try { text = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
    let m;
    while ((m = BW_RE.exec(text)) !== null) {
      const hitLineIdx = text.slice(0, m.index).split('\n').length - 1;
      const lines = text.split('\n');
      const windowLines = lines.slice(hitLineIdx, hitLineIdx + 60).join('\n');
      if (!/width\s*:/.test(windowLines) && !/minWidth\s*:/.test(windowLines)) {
        findings.push({
          id: `electron-bw-size-${path.basename(fp)}-${hitLineIdx + 1}`,
          severity: 'medium',
          file: safeRel(fp, getCurrentRootDir()),
          line: hitLineIdx + 1,
          message: 'BrowserWindow created without explicit width/height or minWidth/minHeight',
          suggestion: 'Define width, height, minWidth, and minHeight in BrowserWindow options.',
        });
      }
      BW_RE.lastIndex = 0;
    }
    BW_RE.lastIndex = 0;

    // nodeIntegration: true
    const niTextIdx = text.search(NI_RE);
    if (niTextIdx !== -1) {
      const lineIdx = text.slice(0, niTextIdx).split('\n').length - 1;
      findings.push({
        id: `electron-ni-${path.basename(fp)}-${lineIdx + 1}`,
        severity: 'critical',
        file: safeRel(fp, getCurrentRootDir()),
        line: lineIdx + 1,
        message: 'nodeIntegration: true — a security risk',
        suggestion: 'Use contextBridge and preload.js; set nodeIntegration to false or remove it.',
      });
    }
    NI_RE.lastIndex = 0;
  }
  return findings;
}

/**
 * ── 10. Package Freshness ─────────────────────────────────────────────────
 */
async function runPackageFreshness(rootDir, _filePaths, _config) {
  const findings = [];
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const lockPath = path.join(rootDir, 'package-lock.json');

  try {
    const pkgStat = await fs.promises.stat(pkgJsonPath).catch(() => null);
    const lockStat = await fs.promises.stat(lockPath).catch(() => null);

    if (!lockStat) {
      findings.push({
        id: 'package-freshness-no-lock',
        severity: 'medium',
        file: 'package.json',
        line: 1,
        message: 'package-lock.json is missing — npm install may produce non-deterministic builds.',
        suggestion: 'Run npm install to generate/update package-lock.json and commit it.',
      });
    } else if (pkgStat) {
      const ageHours = (lockStat.mtimeMs - pkgStat.mtimeMs) / 36e5;
      if (Math.abs(ageHours) > 24) {
        const tag = ageHours > 0 ? `Lock file is ${(ageHours / 24).toFixed(1)} days older than package.json` : `package.json is newer than lock file by ${(-ageHours / 24).toFixed(1)} days`;
        findings.push({
          id: 'package-freshness-stale',
          severity: 'medium',
          file: 'package.json',
          line: 1,
          message: `${tag} — run 'npm install' to sync.`,
          suggestion: 'Run npm install to regenerate package-lock.json.',
        });
      }
    }
  } catch (_) { /* ignore */ }
  return findings;
}

/**
 * ── 11. Git Status Check ───────────────────────────────────────────────────
 */
async function runGitStatusCheck(rootDir) {
  const findings = [];
  try {
    const { stdout } = await execFile('git', ['status', '--porcelain'], { cwd: rootDir, timeout: 15000 });
    const lines = (stdout || '').trim().split('\n').filter(Boolean);
    for (const raw of lines) {
      const [status, ...fileParts] = raw.split(/\s+/);
      const file = fileParts.join(' ');
      const sev = status.startsWith('??') ? 'medium' : 'low';
      findings.push({
        id: `git-${status}-${file.replace(/[^a-zA-Z0-9]/g, '-')}`,
        severity: sev,
        file: safeRel(file, rootDir),
        line: 1,
        message: `Git ${status === '??' ? 'untracked' : 'modified/staged'}: ${file}`,
        suggestion: status === '??'
          ? `Track the file: git add '${file}'`
          : `Review staged/modified changes for: ${file}`,
      });
    }
  } catch (_) { /* not a git repo or git unavailable — no findings */ }
  return findings;
}

/**
 * ── Main Engine Export ─────────────────────────────────────────────────────
 */
async function runAllChecks(rootDir) {
  _currentRootDir = rootDir;
  const config = loadConfig();

  // ── resolve file list ────────────────────────────────────────────────────
  let filePaths;
  if (config.filePaths && Array.isArray(config.filePaths) && config.filePaths.length > 0) {
    filePaths = config.filePaths.map(p => path.resolve(rootDir, p));
  } else {
    filePaths = walkProjectJsFiles(rootDir);
  }

  const allowedFiles = config.allowedProcessExitFiles || [];

  // ── check registry ───────────────────────────────────────────────────────
  const checks = {};

  // Each check entry: { key, fn, requiredArgs }
  const registry = [
    { key: 'syntaxCheck',         fn: runSyntaxCheck,          args: () => [filePaths, rootDir, config] },
    { key: 'npmAudit',            fn: runNpmAudit,             args: () => [rootDir] },
    { key: 'deadImportDetector',  fn: runDeadImportDetector,   args: () => [filePaths, rootDir, config] },
    { key: 'unguardedLogDetector',fn: runUnguardedLogDetector, args: () => [filePaths, rootDir, config] },
    { key: 'todoMarkerDetector',  fn: runTodoMarkerDetector,   args: () => [filePaths, rootDir, config] },
    { key: 'ipcHandlerGuardDetector', fn: runIpcHandlerGuardDetector, args: () => [filePaths, rootDir, config] },
    { key: 'processExitDetector',  fn: runProcessExitDetector,  args: () => [filePaths, allowedFiles, rootDir, config] },
    { key: 'unhandledPromiseDetector', fn: runUnhandledPromiseDetector, args: () => [filePaths, rootDir, config] },
    { key: 'electronSecurityCheck', fn: runElectronSecurityCheck, args: () => [filePaths, rootDir, config] },
    { key: 'packageFreshness',    fn: runPackageFreshness,     args: () => [rootDir, filePaths, config] },
    { key: 'gitStatusCheck',      fn: runGitStatusCheck,       args: () => [rootDir] },
  ];

  const cutoffMap = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const entry of registry) {
    const t0 = Date.now();
    let findings = [];
    let severity = 'low';
    let passed = true;
    try {
      findings = await entry.fn(...entry.args());
      if (findings.length > 0) {
        passed = false;
        severity = findings.reduce((worst, f) => {
          const order = ['critical', 'high', 'medium', 'low'];
          return order.indexOf(f.severity) < order.indexOf(worst) ? f.severity : worst;
        }, findings[0].severity);
      }
    } catch (e) {
      passed = false;
      severity = 'high';
      findings = [{
        id: `${entry.key}-error`,
        severity: 'high',
        file: 'checker-engine.js',
        line: 1,
        message: `Checker threw an exception: ${e.message}`,
        suggestion: 'Investigate the checker engine error.',
      }];
    }
    const durationMs = Date.now() - t0;
    checks[entry.key] = { severity, passed, findings, durationMs };
    if (!passed) cutoffMap[severity]++;
  }

  // ── summary ───────────────────────────────────────────────────────────────
  const allFindings = Object.values(checks).flatMap(c => c.findings);
  const summary = {
    total: allFindings.length,
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high:     allFindings.filter(f => f.severity === 'high').length,
    medium:   allFindings.filter(f => f.severity === 'medium').length,
    low:      allFindings.filter(f => f.severity === 'low').length,
    filesScanned: filePaths.length,
  };

  return {
    runAt: new Date().toISOString(),
    rootDir,
    config: config.key ? { key: config.key } : {},
    checks,
    summary,
  };
}

/**
 * ── Re-export helpers for internal use ─────────────────────────────────────
 */
module.exports = {
  runAllChecks,
  runSyntaxCheck,
  runNpmAudit,
  runDeadImportDetector,
  runUnguardedLogDetector,
  runTodoMarkerDetector,
  runIpcHandlerGuardDetector,
  runProcessExitDetector,
  runUnhandledPromiseDetector,
  runElectronSecurityCheck,
  runPackageFreshness,
  runGitStatusCheck,
};
