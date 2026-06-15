// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('PhoneFarmConfirmModal', () => {
  beforeEach(() => {
    // Load the module under test
    require('../renderer/components/confirm-modal.js');
  });

  afterEach(() => {
    // Clean up using the module's dismiss function to reset internal state
    if (window.PhoneFarmConfirmModal) {
      window.PhoneFarmConfirmModal.dismissConfirmModal();
    }
  });

  function showModal(opts = {}) {
    return window.PhoneFarmConfirmModal.showConfirmModal({
      title: 'Test Başlık',
      message: 'Test mesajı',
      ...opts,
    });
  }

  it('renders with given title and message', () => {
    showModal();
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop).not.toBeNull();

    const card = backdrop.querySelector('.confirm-modal-card');
    expect(card).not.toBeNull();

    const titleEl = card.querySelector('.confirm-modal-title');
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent).toBe('Test Başlık');

    const messageEl = card.querySelector('.confirm-modal-message');
    expect(messageEl).not.toBeNull();
    expect(messageEl.textContent).toBe('Test mesajı');
  });

  it('uses default Turkish button text when none provided', () => {
    showModal();
    const btns = document.querySelectorAll('.confirm-modal-btn');
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toBe('Onayla');
    expect(btns[1].textContent).toBe('İptal');
  });

  it('uses custom button text when provided', () => {
    showModal({ confirmText: 'Evet', cancelText: 'Hayır' });
    const btns = document.querySelectorAll('.confirm-modal-btn');
    expect(btns[0].textContent).toBe('Evet');
    expect(btns[1].textContent).toBe('Hayır');
  });

  it('calls onConfirm when confirm button clicked and removes modal', () => {
    let called = false;
    showModal({ onConfirm: () => { called = true; } });

    const btns = document.querySelectorAll('.confirm-modal-btn');
    btns[0].click();

    expect(called).toBe(true);
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop).toBeNull();
  });

  it('calls onCancel when cancel button clicked and removes modal', () => {
    let called = false;
    showModal({ onCancel: () => { called = true; } });

    const btns = document.querySelectorAll('.confirm-modal-btn');
    btns[1].click();

    expect(called).toBe(true);
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop).toBeNull();
  });

  it('dismisses modal on Escape key', () => {
    let cancelCalled = false;
    showModal({ onCancel: () => { cancelCalled = true; } });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(cancelCalled).toBe(true);
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop).toBeNull();
  });

  it('calls onConfirm on Enter key', () => {
    let confirmCalled = false;
    showModal({ onConfirm: () => { confirmCalled = true; } });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(confirmCalled).toBe(true);
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop).toBeNull();
  });

  it('has aria attributes for accessibility', () => {
    showModal();
    const backdrop = document.querySelector('.confirm-modal-backdrop');
    expect(backdrop.getAttribute('role')).toBe('dialog');
    expect(backdrop.getAttribute('aria-modal')).toBe('true');
    expect(backdrop.getAttribute('aria-labelledby')).toBe('confirm-modal-title');
  });

  it('calls onCancel when backdrop is clicked', () => {
    let cancelCalled = false;
    showModal({ onCancel: () => { cancelCalled = true; } });

    const backdrop = document.querySelector('.confirm-modal-backdrop');
    // Click the backdrop, not the card
    backdrop.click();

    expect(cancelCalled).toBe(true);
    expect(document.querySelector('.confirm-modal-backdrop')).toBeNull();
  });

  it('focuses the confirm button on open', () => {
    showModal();
    const btns = document.querySelectorAll('.confirm-modal-btn');
    expect(document.activeElement).toBe(btns[0]);
  });
});
