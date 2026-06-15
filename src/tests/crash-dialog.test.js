const fs = require('fs');

const mockElectron = {
  dialog: { showMessageBox: function() {} },
  app: {
    getPath: function() { return '/tmp/test-user-data'; },
    relaunch: function() {},
    exit: function() {},
    quit: function() {},
  },
};

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: mockElectron,
  paths: [],
};

const crashDialog = require('../main/crash-dialog');

describe('crash-dialog module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export showCrashDialog as a function', () => {
    expect(typeof crashDialog.showCrashDialog).toBe('function');
  });

  it('should show dialog with Turkish title and buttons', async () => {
    const spy = vi.spyOn(mockElectron.dialog, 'showMessageBox')
      .mockResolvedValue({ response: 1 });
    await crashDialog.showCrashDialog({ error: new Error('Test') });
    expect(spy).toHaveBeenCalledTimes(1);
    const opts = spy.mock.calls[0][0];
    expect(opts.title).toBe('Uygulama Beklenmedik \u015eekilde Kapat\u0131ld\u0131');
    expect(opts.buttons).toEqual(['Yeniden Ba\u015flat', 'Kapat']);
    expect(opts.type).toBe('error');
  });

  it('should relaunch on restart click', async () => {
    vi.spyOn(mockElectron.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });
    vi.spyOn(mockElectron.app, 'relaunch');
    vi.spyOn(mockElectron.app, 'exit');
    await crashDialog.showCrashDialog({ error: new Error('Test') });
    expect(mockElectron.app.relaunch).toHaveBeenCalledTimes(1);
    expect(mockElectron.app.exit).toHaveBeenCalledWith(0);
  });

  it('should quit on close click', async () => {
    vi.spyOn(mockElectron.dialog, 'showMessageBox').mockResolvedValue({ response: 1 });
    vi.spyOn(mockElectron.app, 'quit');
    await crashDialog.showCrashDialog({ error: new Error('Test') });
    expect(mockElectron.app.quit).toHaveBeenCalledTimes(1);
  });

  it('should log crash before showing dialog', async () => {
    vi.spyOn(mockElectron.dialog, 'showMessageBox').mockResolvedValueOnce({ response: 1 });
    const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation(function() {});
    await crashDialog.showCrashDialog({ error: new Error('boom') });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toContain('boom');
    spy.mockRestore();
  });

  it('should handle null error gracefully', async () => {
    vi.spyOn(mockElectron.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });
    await crashDialog.showCrashDialog({ error: null });
    const opts = mockElectron.dialog.showMessageBox.mock.calls[0][0];
    expect(opts.detail).toBeTruthy();
  });

  it('should only show Kapat when canRestart=false', async () => {
    vi.spyOn(mockElectron.dialog, 'showMessageBox').mockResolvedValue({ response: 0 });
    vi.spyOn(mockElectron.app, 'quit');
    await crashDialog.showCrashDialog({ error: new Error('Test'), canRestart: false });
    const opts = mockElectron.dialog.showMessageBox.mock.calls[0][0];
    expect(opts.buttons).toEqual(['Kapat']);
    expect(mockElectron.app.quit).toHaveBeenCalledTimes(1);
  });
});
