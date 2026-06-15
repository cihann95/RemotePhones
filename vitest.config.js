const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    // Electron main process runs in Node; renderer may use jsdom if needed
    globals: true,
    environment: 'node',
    // confirm-modal uses DOM APIs — needs jsdom
    environmentMatchGlobs: [
      ['src/tests/confirm-modal.test.js', 'jsdom'],
      ['src/tests/error-boundary.test.js', 'happy-dom'],
      ['src/tests/connection-banner.test.js', 'happy-dom'],
    ],
    include: [
      'src/tests/error_messages.test.js',
      'src/tests/crash-dialog.test.js',
      'src/tests/confirm-modal.test.js',
      'src/tests/preflight.test.js',
      'src/tests/tray.test.js',
      'src/tests/error-boundary.test.js',
      'src/tests/error-leaks.test.js',
      'src/tests/connection-banner.test.js',
    ],
    css: false,
    // Support both CommonJS (main process) and ESM (renderer)
    server: {
      deps: {
        // Inline node_modules that require transformation
        inline: [],
      },
    },
  },
});
