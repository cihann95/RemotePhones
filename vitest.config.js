const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    // Electron main process runs in Node; renderer may use jsdom if needed
    globals: true,
    environment: 'node',
    // confirm-modal uses DOM APIs — needs jsdom
    environmentMatchGlobs: [
      ['src/tests/confirm-modal.test.js', 'jsdom'],
    ],
    include: [
      'src/tests/error_messages.test.js',
      'src/tests/crash-dialog.test.js',
      'src/tests/confirm-modal.test.js',
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
