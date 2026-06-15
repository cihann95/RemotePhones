// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ConnectionBanner', () => {
  beforeEach(() => {
    window.electronAPI = {
      onDeviceDisconnected: vi.fn(() => vi.fn()),
      onDeviceConnected: vi.fn(() => vi.fn()),
      onDevicesUpdated: vi.fn(() => vi.fn()),
      onHealthCritical: vi.fn(() => vi.fn()),
      refreshDevices: vi.fn()
    };
    const modulePath = require.resolve('../renderer/components/connection-banner.js');
    delete require.cache[modulePath];
    require(modulePath);
  });

  afterEach(() => {
    if (window.ConnectionBanner) {
      window.ConnectionBanner.destroy();
    }
    delete window.electronAPI;
    delete window.ConnectionBanner;
    document.querySelectorAll('.connection-banner').forEach(el => el.remove());
  });

  it('exposes public API on window.ConnectionBanner', () => {
    expect(window.ConnectionBanner).toBeDefined();
    expect(typeof window.ConnectionBanner.init).toBe('function');
    expect(typeof window.ConnectionBanner.show).toBe('function');
    expect(typeof window.ConnectionBanner.hide).toBe('function');
    expect(typeof window.ConnectionBanner.dismiss).toBe('function');
    expect(typeof window.ConnectionBanner.destroy).toBe('function');
  });

  it('shows banner when show() is called with a device', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    const banner = document.querySelector('.connection-banner');
    expect(banner).not.toBeNull();
  });

  it('hides banner when hide() is called', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    window.ConnectionBanner.hide();
    expect(window.ConnectionBanner.isVisible()).toBe(false);
    expect(document.querySelector('.connection-banner')).toBeNull();
  });

  it('displays Turkish title with device name for single device', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const title = document.querySelector('.connection-banner-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('Ba\u011Flant\u0131 Kesildi: Pixel 6');
  });

  it('displays Turkish description text', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const desc = document.querySelector('.connection-banner-desc');
    expect(desc).not.toBeNull();
    expect(desc.textContent).toContain('otomatik yeniden ba\u011Flan');
  });

  it('aggregates multiple disconnected devices', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    window.ConnectionBanner.show({ id: 'dev2', model: 'Samsung S21' });
    expect(window.ConnectionBanner.getDisconnectedCount()).toBe(2);
    const title = document.querySelector('.connection-banner-title');
    expect(title.textContent).toBe('2 cihaz\u0131n ba\u011Flant\u0131s\u0131 kesildi');
  });

  it('uses warning severity for device disconnect', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const banner = document.querySelector('.connection-banner');
    expect(banner.classList.contains('connection-banner-warning')).toBe(true);
  });

  it('shows ADB down banner with critical severity', () => {
    window.ConnectionBanner.setAdbDown(true);
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    const banner = document.querySelector('.connection-banner');
    expect(banner.classList.contains('connection-banner-critical')).toBe(true);
    const title = document.querySelector('.connection-banner-title');
    expect(title.textContent).toContain('ADB Sunucusu');
  });

  it('shows ADB down Turkish description', () => {
    window.ConnectionBanner.setAdbDown(true);
    const desc = document.querySelector('.connection-banner-desc');
    expect(desc.textContent).toContain('ADB sunucusu');
    expect(desc.textContent).toContain('otomatik yeniden ba\u015Flat');
  });

  it('dismiss hides the banner', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    window.ConnectionBanner.dismiss();
    expect(window.ConnectionBanner.isVisible()).toBe(false);
    expect(window.ConnectionBanner.isDismissed()).toBe(true);
  });

  it('has a reconnect button', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const btn = document.querySelector('.connection-banner-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Yeniden Ba\u011Flan');
  });

  it('has a dismiss button with aria-label', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const btn = document.querySelector('.connection-banner-dismiss');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Kapat');
  });

  it('has role="alert" for accessibility', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const banner = document.querySelector('.connection-banner');
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('reconnect button triggers refreshDevices', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const btn = document.querySelector('.connection-banner-btn');
    btn.click();
    expect(window.electronAPI.refreshDevices).toHaveBeenCalled();
  });

  it('dismiss button hides the banner', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    const btn = document.querySelector('.connection-banner-dismiss');
    btn.click();
    expect(window.ConnectionBanner.isVisible()).toBe(false);
  });

  it('init() subscribes to IPC events', () => {
    window.ConnectionBanner.init();
    expect(window.electronAPI.onDeviceDisconnected).toHaveBeenCalled();
    expect(window.electronAPI.onDeviceConnected).toHaveBeenCalled();
    expect(window.electronAPI.onDevicesUpdated).toHaveBeenCalled();
    expect(window.electronAPI.onHealthCritical).toHaveBeenCalled();
  });

  it('shows banner when device-disconnected IPC fires', () => {
    let disconnectHandler;
    window.electronAPI.onDeviceDisconnected = vi.fn((cb) => {
      disconnectHandler = cb;
      return vi.fn();
    });
    window.ConnectionBanner.init();

    disconnectHandler({ id: 'abc123', model: 'Galaxy S22' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    expect(window.ConnectionBanner.getDisconnectedCount()).toBe(1);
  });

  it('hides banner when device-connected IPC restores last device', () => {
    let disconnectHandler, connectHandler;
    window.electronAPI.onDeviceDisconnected = vi.fn((cb) => { disconnectHandler = cb; return vi.fn(); });
    window.electronAPI.onDeviceConnected = vi.fn((cb) => { connectHandler = cb; return vi.fn(); });
    window.ConnectionBanner.init();

    disconnectHandler({ id: 'abc123', model: 'Galaxy S22' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);

    connectHandler({ id: 'abc123', model: 'Galaxy S22' });
    expect(window.ConnectionBanner.isVisible()).toBe(false);
  });

  it('aggregates from IPC: two disconnects then one reconnect keeps banner', () => {
    let disconnectHandler, connectHandler;
    window.electronAPI.onDeviceDisconnected = vi.fn((cb) => { disconnectHandler = cb; return vi.fn(); });
    window.electronAPI.onDeviceConnected = vi.fn((cb) => { connectHandler = cb; return vi.fn(); });
    window.ConnectionBanner.init();

    disconnectHandler({ id: 'dev1', model: 'Pixel 6' });
    disconnectHandler({ id: 'dev2', model: 'Samsung S21' });
    expect(window.ConnectionBanner.getDisconnectedCount()).toBe(2);

    connectHandler({ id: 'dev1', model: 'Pixel 6' });
    expect(window.ConnectionBanner.getDisconnectedCount()).toBe(1);
    expect(window.ConnectionBanner.isVisible()).toBe(true);

    const title = document.querySelector('.connection-banner-title');
    expect(title.textContent).toBe('Ba\u011Flant\u0131 Kesildi: Samsung S21');
  });

  it('shows banner on health:system-critical with ADB alert', () => {
    let healthHandler;
    window.electronAPI.onHealthCritical = vi.fn((cb) => { healthHandler = cb; return vi.fn(); });
    window.ConnectionBanner.init();

    healthHandler(['ADB service is not running']);
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    expect(window.ConnectionBanner.isAdbDown()).toBe(true);
  });

  it('destroy cleans up banner and state', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6' });
    expect(window.ConnectionBanner.isVisible()).toBe(true);
    window.ConnectionBanner.destroy();
    expect(window.ConnectionBanner.isVisible()).toBe(false);
    expect(window.ConnectionBanner.getDisconnectedCount()).toBe(0);
    expect(document.querySelector('.connection-banner')).toBeNull();
  });

  it('uses customName over model for display', () => {
    window.ConnectionBanner.show({ id: 'dev1', model: 'Pixel 6', customName: 'Mutfak Telefonu' });
    const title = document.querySelector('.connection-banner-title');
    expect(title.textContent).toBe('Ba\u011Flant\u0131 Kesildi: Mutfak Telefonu');
  });
});
