// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const MODULE_PATH = require.resolve('../renderer/components/error-boundary.js');

describe('ErrorBoundary', () => {
  let reloadMock;

  beforeEach(() => {
    // Clear require cache so module re-executes fresh each test
    delete require.cache[MODULE_PATH];
    // Reset global state
    delete window.ErrorBoundary;
    document.body.innerHTML = '';
    // Mock location.reload
    reloadMock = vi.fn();
    delete window.location;
    window.location = { reload: reloadMock };
    // Mock electronAPI
    window.electronAPI = { relaunch: vi.fn().mockResolvedValue({ success: true }) };
  });

  afterEach(() => {
    if (window.ErrorBoundary && typeof window.ErrorBoundary.reset === 'function') {
      window.ErrorBoundary.reset();
    }
    delete window.electronAPI;
  });

  function loadAndInit() {
    require('../renderer/components/error-boundary.js');
    window.ErrorBoundary.init();
  }

  it('renders overlay with Turkish error message on runtime error', () => {
    loadAndInit();
    window.onerror('test error', 'test.js', 1, 1, new Error('test'));
    const backdrop = document.querySelector('.error-boundary-backdrop');
    expect(backdrop).not.toBeNull();
    const title = backdrop.querySelector('.error-boundary-title');
    expect(title.textContent).toBe('Bir hata oluştu. Uygulama düzgün çalışmayabilir.');
  });

  it('renders overlay with Turkish message on unhandled rejection', () => {
    loadAndInit();
    window.onunhandledrejection({ reason: 'promise error' });
    const backdrop = document.querySelector('.error-boundary-backdrop');
    expect(backdrop).not.toBeNull();
    const title = backdrop.querySelector('.error-boundary-title');
    expect(title.textContent).toBe('Beklenmeyen bir hata oluştu.');
  });

  it('shows retry and restart buttons', () => {
    loadAndInit();
    window.onerror('err', '', 0, 0, new Error('x'));
    const btns = document.querySelectorAll('.error-boundary-btn');
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toBe('Tekrar Dene');
    expect(btns[1].textContent).toBe('Yeniden Başlat');
  });

  it('reloads page on retry click', () => {
    loadAndInit();
    window.onerror('err', '', 0, 0, new Error('x'));
    const retryBtn = document.querySelector('.error-boundary-btn-retry');
    retryBtn.click();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('calls electronAPI.relaunch on restart click', () => {
    loadAndInit();
    window.onerror('err', '', 0, 0, new Error('x'));
    const restartBtn = document.querySelector('.error-boundary-btn-restart');
    restartBtn.click();
    expect(window.electronAPI.relaunch).toHaveBeenCalledTimes(1);
  });

  it('disables retry button after MAX_RETRIES (3)', () => {
    loadAndInit();
    window.onerror('err', '', 0, 0, new Error('x'));
    expect(window.ErrorBoundary.getRetryCount()).toBe(0);
    let retryBtn = document.querySelector('.error-boundary-btn-retry');
    expect(retryBtn.disabled).toBe(false);

    retryBtn.click();
    expect(window.ErrorBoundary.getRetryCount()).toBe(1);

    window.onerror('err2', '', 0, 0, new Error('y'));
    retryBtn = document.querySelector('.error-boundary-btn-retry');
    expect(retryBtn.disabled).toBe(false);
    retryBtn.click();
    expect(window.ErrorBoundary.getRetryCount()).toBe(2);

    window.onerror('err3', '', 0, 0, new Error('z'));
    retryBtn = document.querySelector('.error-boundary-btn-retry');
    expect(retryBtn.disabled).toBe(false);
    retryBtn.click();
    expect(window.ErrorBoundary.getRetryCount()).toBe(3);

    window.onerror('err4', '', 0, 0, new Error('w'));
    retryBtn = document.querySelector('.error-boundary-btn-retry');
    expect(retryBtn.disabled).toBe(true);
  });

  it('does not create duplicate overlays', () => {
    loadAndInit();
    window.onerror('err1', '', 0, 0, new Error('a'));
    window.onerror('err2', '', 0, 0, new Error('b'));
    const backdrops = document.querySelectorAll('.error-boundary-backdrop');
    expect(backdrops.length).toBe(1);
  });

  it('reset() clears retry count and removes overlay', () => {
    loadAndInit();
    window.onerror('err', '', 0, 0, new Error('x'));
    expect(window.ErrorBoundary.isOverlayVisible()).toBe(true);
    window.ErrorBoundary.reset();
    expect(window.ErrorBoundary.getRetryCount()).toBe(0);
    expect(window.ErrorBoundary.isOverlayVisible()).toBe(false);
    expect(document.querySelector('.error-boundary-backdrop')).toBeNull();
  });

  it('restart button works even when retry is disabled', () => {
    loadAndInit();
    for (let i = 0; i < 3; i++) {
      window.onerror('err' + i, '', 0, 0, new Error('e' + i));
      const btn = document.querySelector('.error-boundary-btn-retry');
      if (btn && !btn.disabled) btn.click();
    }
    window.onerror('final', '', 0, 0, new Error('final'));
    const retryBtn = document.querySelector('.error-boundary-btn-retry');
    const restartBtn = document.querySelector('.error-boundary-btn-restart');
    expect(retryBtn.disabled).toBe(true);
    expect(restartBtn.disabled).toBe(false);
    restartBtn.click();
    expect(window.electronAPI.relaunch).toHaveBeenCalledTimes(1);
  });
});