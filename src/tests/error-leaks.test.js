/**
 * Tests for Task 8: Verify no raw e.message leaks in renderer files.
 * All user-facing error messages must go through humanizeError().
 */
const fs = require('fs');
const path = require('path');

const rendererDir = path.resolve(__dirname, '../renderer');

function getJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
      results.push(...getJsFiles(fullPath));
    }
  }
  return results;
}

const rawMessagePattern = /(?:e|error|err)\?\.message\b/g;
const stringECastPattern = /String\(\s*(?:e|error|err)\s*\)/g;

const allowedPatterns = [
  'humanizeError',
  'console.error',
  'entry.message',
  'r.message',
  'data.message',
  'result.error',
  'result?.error',
  'status.message',
  'info.message',
  'progress.message',
  'info.version',
  'e.message || String(e)',
  'e?.message || String(e)',
  'error.message || String(error)',
  'error.message ||',
];

function isAllowed(line) {
  return allowedPatterns.some(p => line.includes(p));
}

describe('error-leaks: no raw e.message in renderer files', () => {
  const files = getJsFiles(rendererDir);

  it('should have found renderer JS files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = path.relative(rendererDir, file);
    describe(rel, () => {
      let content;
      let lines;

      beforeAll(() => {
        content = fs.readFileSync(file, 'utf-8');
        lines = content.split('\n');
      });

      it('should not have raw e.message not wrapped in humanizeError', () => {
        const violations = [];
        lines.forEach((line, idx) => {
          if (rawMessagePattern.test(line) && !isAllowed(line)) {
            violations.push({ line: idx + 1, text: line.trim() });
          }
          rawMessagePattern.lastIndex = 0;
        });
        expect(violations).toEqual([]);
      });

      it('should not have raw String(e) not wrapped in humanizeError', () => {
        const violations = [];
        lines.forEach((line, idx) => {
          if (stringECastPattern.test(line) && !isAllowed(line)) {
            violations.push({ line: idx + 1, text: line.trim() });
          }
          stringECastPattern.lastIndex = 0;
        });
        expect(violations).toEqual([]);
      });
    });
  }
});

describe('humanizeError IPC handler', () => {
  const mainPath = path.resolve(__dirname, '../main/main.js');
  const preloadPath = path.resolve(__dirname, '../preload.js');

  it('should have humanize-error IPC handler in main.js', () => {
    const content = fs.readFileSync(mainPath, 'utf-8');
    expect(content).toMatch(/ipcMain\.handle\(['"]humanize-error['"]|safeHandle\(['"]humanize-error['"]/);
  });

  it('should expose humanizeError in preload.js', () => {
    const content = fs.readFileSync(preloadPath, 'utf-8');
    expect(content).toContain('humanizeError');
    expect(content).toContain("'humanize-error'");
  });
});