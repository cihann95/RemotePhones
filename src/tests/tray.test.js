/**
 * Tests for system tray module.
 * Validates tray creation, context menu structure, and click handlers.
 * Uses dependency injection (deps param) to avoid vi.mock issues.
 */

/* global describe, it, expect, vi, beforeEach */

const trayModule = require('../main/tray');

function createMockTray() {
  return {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
}

function createMockElectron(trayInstance) {
  return {
    Tray: vi.fn(() => trayInstance),
    Menu: {
      buildFromTemplate: vi.fn((template) => template),
    },
  };
}

function createMockFs(exists) {
  return { existsSync: vi.fn(() => exists) };
}

function createMockWindow() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    restore: vi.fn(),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
  };
}

describe('tray module', () => {
  let mockTray;
  let mockElectron;
  let mockFs;
  let mockMainWindow;
  let mockApp;

  beforeEach(() => {
    trayModule._resetForTesting();

    mockTray = createMockTray();
    mockElectron = createMockElectron(mockTray);
    mockFs = createMockFs(true);
    mockMainWindow = createMockWindow();
    mockApp = { quit: vi.fn() };
  });

  function create(opts) {
    return trayModule.createTray(
      (opts && opts.window) || mockMainWindow,
      (opts && opts.app) || mockApp,
      { electron: mockElectron, fs: mockFs }
    );
  }

  it('should export createTray, getTray, destroyTray, and _resetForTesting', () => {
    expect(typeof trayModule.createTray).toBe('function');
    expect(typeof trayModule.getTray).toBe('function');
    expect(typeof trayModule.destroyTray).toBe('function');
    expect(typeof trayModule._resetForTesting).toBe('function');
  });

  it('should create a Tray instance with the app icon', () => {
    create();
    expect(mockElectron.Tray).toHaveBeenCalled();
  });

  it('should set tooltip to Phone Farm', () => {
    create();
    expect(mockTray.setToolTip).toHaveBeenCalledWith('Phone Farm');
  });

  it('should create context menu with Turkish labels', () => {
    create();
    expect(mockElectron.Menu.buildFromTemplate).toHaveBeenCalled();

    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    const labels = template.filter(item => item.label).map(item => item.label);

    expect(labels).toContain('Göster');
    expect(labels).toContain('Gizle');
    expect(labels).toContain('Çıkış');
  });

  it('should have a separator in the context menu', () => {
    create();
    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    expect(template.some(item => item.type === 'separator')).toBe(true);
  });

  it('should have exactly 4 menu items (show, hide, separator, quit)', () => {
    create();
    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    expect(template.length).toBe(4);
  });

  it('should register click handler on tray', () => {
    create();
    expect(mockTray.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('Göster should show and restore window', () => {
    create();
    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    const showItem = template.find(item => item.label === 'Göster');

    showItem.click();
    expect(mockMainWindow.show).toHaveBeenCalled();
    expect(mockMainWindow.restore).toHaveBeenCalled();
  });

  it('Gizle should hide window', () => {
    create();
    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    const hideItem = template.find(item => item.label === 'Gizle');

    hideItem.click();
    expect(mockMainWindow.hide).toHaveBeenCalled();
  });

  it('Çıkış should quit the app', () => {
    create();
    const template = mockElectron.Menu.buildFromTemplate.mock.calls[0][0];
    const quitItem = template.find(item => item.label === 'Çıkış');

    quitItem.click();
    expect(mockApp.quit).toHaveBeenCalled();
  });

  it('left-click should hide visible window', () => {
    create();
    const clickHandler = mockTray.on.mock.calls.find(call => call[0] === 'click')[1];

    mockMainWindow.isVisible.mockReturnValue(true);
    clickHandler();

    expect(mockMainWindow.hide).toHaveBeenCalled();
  });

  it('left-click should show hidden window', () => {
    create();
    const clickHandler = mockTray.on.mock.calls.find(call => call[0] === 'click')[1];

    mockMainWindow.isVisible.mockReturnValue(false);
    clickHandler();

    expect(mockMainWindow.show).toHaveBeenCalled();
    expect(mockMainWindow.restore).toHaveBeenCalled();
  });

  it('should return null if icon file is missing', () => {
    mockFs = createMockFs(false);
    const result = trayModule.createTray(mockMainWindow, mockApp, {
      electron: mockElectron,
      fs: mockFs,
    });
    expect(result).toBeNull();
  });

  it('destroyTray should destroy the tray instance', () => {
    create();
    trayModule.destroyTray();
    expect(mockTray.destroy).toHaveBeenCalled();
    expect(trayModule.getTray()).toBeNull();
  });

  it('getTray should return null before creation', () => {
    expect(trayModule.getTray()).toBeNull();
  });
});
