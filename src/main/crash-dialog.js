/**
 * Crash dialog module.
 * Shows a native crash dialog with a restart button on uncaught exceptions.
 * Logs crash details to app.getPath('userData')/crash.log before showing the dialog.
 *
 * @module crash-dialog
 */
const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Shows a native crash dialog with Turkish text and a restart button.
 * Logs the error to a crash log before showing the dialog.
 *
 * @param {Object} options
 * @param {Error}  options.error        - The error that caused the crash
 * @param {boolean}[options.canRestart] - Whether to offer restart (default true)
 * @returns {Promise<void>}
 */
async function showCrashDialog({ error, canRestart = true }) {

  // Log the error to a crash log file BEFORE showing the dialog
  // so the log is persisted even if the process exits
  logCrash(error);

  const message = error && error.message
    ? error.message
    : (error ? String(error) : 'Bilinmeyen bir hata oluştu.');

  const dialogOptions = {
    type: 'error',
    title: 'Uygulama Beklenmedik Şekilde Kapatıldı',
    message: 'Beklenmedik bir hata oluştu.',
    detail: message,
    buttons: canRestart ? ['Yeniden Başlat', 'Kapat'] : ['Kapat'],
    defaultId: canRestart ? 0 : -1,
    cancelId: canRestart ? 1 : 0,
  };

  const result = await dialog.showMessageBox(dialogOptions);

  if (canRestart && result.response === 0) {
    // "Yeniden Başlat" — relaunch the app
    app.relaunch();
    app.exit(0);
  } else {
    // "Kapat" — just quit
    app.quit();
  }
}

/**
 * Appends a crash record to app.getPath('userData')/crash.log.
 * Uses appendFileSync so the log entry is flushed before the process may exit.
 *
 * @param {Error} error
 * @returns {void}
 */
function logCrash(error) {
  try {
    const crashLogPath = path.join(app.getPath('userData'), 'crash.log');
    const timestamp = new Date().toISOString();
    const stack = error && error.stack
      ? error.stack
      : (error ? String(error) : 'No error info available');
    const message = error && error.message
      ? error.message
      : 'No error message';

    const entry = [
      '',
      `=== Crash at ${timestamp} ===`,
      `Message: ${message}`,
      `Stack: ${stack}`,
      '',
    ].join('\n');

    fs.appendFileSync(crashLogPath, entry, 'utf8');
  } catch (writeErr) {
    console.error('[CrashDialog] Failed to write crash log:', writeErr);
  }
}

module.exports = { showCrashDialog };
