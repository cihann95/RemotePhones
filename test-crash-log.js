const fs = require('fs');
const path = require('path');
const os = require('os');

// Mimic the writeCrashLog function from main.js for testing
function writeCrashLog(error, type) {
  try {
    const logsDir = path.join(__dirname, 'logs', 'crash-logs');
    fs.mkdirSync(logsDir, { recursive: true });

    const filename = `crash-${Date.now()}-${type}.log`;
    const filepath = path.join(logsDir, filename);

    const stack = (error && error.stack)
      ? error.stack
      : (error ? String(error) : 'No error info available');

    const lines = [
      '=== Crash Report ===',
      `Type: ${type}`,
      `Timestamp: ${new Date().toISOString()}`,
      `PID: ${process.pid}`,
      '',
      '=== Stack Trace ===',
      stack,
      '',
      '=== Runtime Versions ===',
      `Node: ${process.versions.node || 'unknown'}`,
      `Electron: ${process.versions.electron || 'unknown'}`,
      `Chrome: ${process.versions.chrome || 'unknown'}`,
      `V8: ${process.versions.v8 || 'unknown'}`,
      '',
      '=== System Info ===',
      `Platform: ${os.platform()}`,
      `Release: ${os.release()}`,
      `Arch: ${os.arch()}`,
      `OS Type: ${os.type()}`,
      `Hostname: ${os.hostname()}`,
      `CPUs: ${os.cpus() ? os.cpus().length : 'unknown'}`,
      `Total Memory: ${os.totalmem()} bytes`,
      `Free Memory: ${os.freemem()} bytes`,
      ''
    ];

    fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
    console.error(`[Crash] Wrote crash log to: ${filepath}`);
    return filepath;
  } catch (writeErr) {
    console.error('[Crash] Failed to write crash log:', writeErr);
    console.error('[Crash] Original error:', error);
    return null;
  }
}

console.log('--- QA Scenario: Simulate Crash and Verify Log File Creation ---');

// 1. Simulate an uncaught exception
const simulatedError = new Error('Simulated uncaught exception for QA testing');
const logPath = writeCrashLog(simulatedError, 'uncaughtException');

// 2. Verify log file creation
if (logPath && fs.existsSync(logPath)) {
  const stats = fs.statSync(logPath);
  const content = fs.readFileSync(logPath, 'utf8');
  
  console.log('SUCCESS: Crash log file created successfully.');
  console.log(`File path: ${logPath}`);
  console.log(`File size: ${stats.size} bytes`);
  
  // Verify content contains expected markers
  const hasType = content.includes('Type: uncaughtException');
  const hasStack = content.includes('=== Stack Trace ===');
  const hasSimulatedError = content.includes('Simulated uncaught exception for QA testing');
  
  if (hasType && hasStack && hasSimulatedError) {
    console.log('SUCCESS: Crash log content verified.');
  } else {
    console.error('FAILURE: Crash log content missing expected markers.');
    process.exit(1);
  }
} else {
  console.error('FAILURE: Crash log file was not created.');
  process.exit(1);
}

console.log('--- QA Scenario Completed Successfully ---');
