# Style Audit — src/renderer/style.css
Generated: 2026-05-21T00:38:25+03:00

## Methodology
Scanned:
- **style.css**: 179 CSS rule selectors bearing a `.` class specifier (pseudo-classes and child element selectors included per task instruction).
- **HTML files**: `index.html`, `home.html`, `setup.html`, `office.html`, `help.html`, `about.html`
- **JS files**: `index.js`, `renderer.js`, `setup.js`, `office.js`, `license.js`, `help.js`, `about.js`

A rule is **dead** when its leading (first-named) class selector component does not appear in any HTML `class="…"` attribute nor in any JS `className` assignment, `classList.*` call, or template-string class fragment across all `.js` files. Pseudo-selectors (`::before`, `:hover`, `:disabled`, `:last-child`, …) inherit live/dead status from their base class.

---

## Dead-weight candidates (112 rules — selector not referenced in any .js/.html)

| Line | Selector | Used in HTML? | Used in JS? |
|------|----------|--------------|------------|
| 96 | `.subtitle` | ✗ | ✗ |
| 167 | `.mode-btn` | ✗ | ✗ |
| 86 | `.logo-icon` | ✗ | ✗ |
| 180 | `.status-item` | ✗ | ✗ |
| 186 | `.status-icon` | ✗ | ✗ |
| 377 | `.status-badge::before` | ✗ | ✗ |
| 389 | `.status-online::before` | ✗ | ✗ |
| 398 | `.status-offline::before` | ✗ | ✗ |
| 407 | `.status-warning::before` | ✗ | ✗ |
| 416 | `.status-unknown::before` | ✗ | ✗ |
| 441 | `.device-card:hover` | ✗ | ✗ |
| 447 | `.device-card.active` | ✗ | ✗ |
| 451 | `.device-card.selected` | ✗ | ✗ |
| 456 | `.device-header` | ✗ | ✗ |
| 463 | `.device-icon` | ✗ | ✗ |
| 467 | `.device-name` | ✗ | ✗ |
| 473 | `.device-id` | ✗ | ✗ |
| 484 | `.device-info` | ✗ | ✗ |
| 487 | `.device-info-item` | ✗ | ✗ |
| 495 | `.device-actions` | ✗ | ✗ |
| 514 | `.device-card:hover .edit-hint` | ✗ | ✗ |
| 529 | `.status-row` | ✗ | ✗ |
| 537 | `.status-row:last-child` | ✗ | ✗ |
| 541 | `.status-label` | ✗ | ✗ |
| 548 | `.status-value` | ✗ | ✗ |
| 585 | `.big-button` | ✗ | ✗ |
| 597 | `.empty-state` | ✗ | ✗ |
| 603 | `.empty-state-icon` | ✗ | ✗ |
| 609 | `.empty-state h3` | ✗ | ✗ |
| 615 | `.empty-state p` | ✗ | ✗ |
| 625 | `.toggle input` | ✗ | ✗ |
| 637 | `.toggle-slider` | ✗ | ✗ |
| 649 | `.toggle-slider::before` | ✗ | ✗ |
| 661 | `.toggle input:checked + .toggle-slider` | ✗ | ✗ |
| 665 | `.toggle input:checked + .toggle-slider::before` | ✗ | ✗ |
| 673 | `.loading-overlay` | ✗ | ✗ |
| 686 | `.modal-card` | ✗ | ✗ |
| 691 | `.modal-card:hover` | ✗ | ✗ |
| 705 | `.form-group label` | ✗ | ✗ |
| 713 | `.form-group input[type="text"]` | ✗ | ✗ |
| 714 | `.form-group textarea` | ✗ | ✗ |
| 715 | `.form-group select` | ✗ | ✗ |
| 727 | `.form-group input:focus` | ✗ | ✗ |
| 728 | `.form-group textarea:focus` | ✗ | ✗ |
| 729 | `.form-group select:focus` | ✗ | ✗ |
| 734 | `.form-actions` | ✗ | ✗ |
| 767 | `.app-footer` | ✗ | ✗ |
| 777 | `.footer-brand` | ✗ | ✗ |
| 785 | `.footer-brand .sergio` | ✗ | ✗ |
| 792 | `.footer-brand .sergio:hover` | ✗ | ✗ |
| 796 | `.footer-divider` | ✗ | ✗ |
| 804 | `.sergio-badge` | ✗ | ✗ |
| 819 | `.back-btn` | ✗ | ✗ |
| 833 | `.back-btn:hover` | ✗ | ✗ |
| 843 | `.connected-devices-list` | ✗ | ✗ |
| 853 | `.connected-device-item` | ✗ | ✗ |
| 859 | `.connected-device-item:hover` | ✗ | ✗ |
| 863 | `.connected-device-item.active` | ✗ | ✗ |
| 868 | `.connected-device-item .device-emoji` | ✗ | ✗ |
| 872 | `.connected-device-item .device-info-compact` | ✗ | ✗ |
| 879 | `.connected-device-item .device-name-compact` | ✗ | ✗ |
| 885 | `.connected-device-item .device-battery-compact` | ✗ | ✗ |
| 900 | `.emoji-btn` | ✗ | ✗ |
| 915 | `.emoji-btn:hover` | ✗ | ✗ |
| 920 | `.emoji-btn.selected` | ✗ | ✗ |
| 936 | `.color-btn` | ✗ | ✗ |
| 945 | `.color-btn:hover` | ✗ | ✗ |
| 949 | `.color-btn.selected` | ✗ | ✗ |
| 964 | `.shortcut-item` | ✗ | ✗ |
| 973 | `.shortcut-key` | ✗ | ✗ |
| 983 | `.shortcut-action` | ✗ | ✗ |
| 992 | `.text-modal-actions` | ✗ | ✗ |
| 998 | `.text-modal-keys` | ✗ | ✗ |
| 1003 | `.text-modal-keys .btn` | ✗ | ✗ |
| 1007 | `.text-send-status` | ✗ | ✗ |
| 1015 | `.text-send-status.success` | ✗ | ✗ |
| 1020 | `.text-send-status.error` | ✗ | ✗ |
| 1025 | `.device-text-btn` | ✗ | ✗ |
| 1031 | `.device-text-btn:hover` | ✗ | ✗ |
| 1041 | `.text-muted` | ✗ | ✗ |
| 1042 | `.text-error` | ✗ | ✗ |
| 1043 | `.text-warning` | ✗ | ✗ |
| 1044 | `.text-success` | ✗ | ✗ |
| 1046 | `.mt-1` | ✗ | ✗ |
| 1048 | `.mt-3` | ✗ | ✗ |
| 1049 | `.mb-1` | ✗ | ✗ |
| 1050 | `.mb-2` | ✗ | ✗ |
| 1051 | `.mb-3` | ✗ | ✗ |
| 1056 | `.flex-center` | ✗ | ✗ |
| 1057 | `.gap-1` | ✗ | ✗ |
| 1058 | `.gap-2` | ✗ | ✗ |
| 747 | `.spinner` | ✗ | ✗ |
| 894 | `.emoji-picker` | ✗ | ✗ |
| 929 | `.color-picker` | ✗ | ✗ |
| 958 | `.shortcut-list` | ✗ | ✗ |

---

## Live selectors (77 rules — live in HTML or JS)

These rules bear at least one class name that is referenced somewhere and are **not** candidates for removal.

| Line | Selector | Live because… |
|------|----------|--------------|
| 65 | `.mode-selection-container` | `class` in `index.html` |
| 73 | `.mode-header` | `class` in `index.html` |
| 78 | `.logo-section` | `class` in `index.html` |
| 109 | `.mode-card` | `class` in `index.html`; `id` click handler in `index.js` |
| 120 | `.mode-card:hover` | base `.mode-card` live |
| 126 | `.mode-icon` | `class` in `index.html` |
| 131 | `.mode-card h2` | base `.mode-card` live |
| 136 | `.mode-card > p` | base `.mode-card` live |
| 141 | `.mode-features` | `class` in `index.html` |
| 150 | `.mode-features li` | base `.mode-features` live |
| 157 | `.mode-features li:last-child` | base `.mode-features` live |
| 161 | `.mode-features li::before` | base `.mode-features` live |
| 171 | `.status-bar` | `class` in `index.html` |
| 198 | `.container` | `class` in `home.html`, `office.html`, `help.html` |
| 204 | `.app-header` | `class` in `home.html`, `office.html`, `help.html` |
| 216 | `.app-header h1` | base `.app-header` live |
| 224 | `.app-header .logo-icon` | base `.app-header` live |
| 228 | `.header-actions` | `class` in `home.html`, `office.html` |
| 238 | `.card` | `class` in `home.html`, `office.html`, `setup.html`, `help.html`, `about.html` |
| 247 | `.card:hover` | base `.card` live |
| 252 | `.card-header` | `class` in `home.html`, `office.html`, `help.html` |
| 261 | `.card-title` | `class` in `home.html`, `office.html`, `about.html` |
| 269 | `.card-title .icon` | base `.card-title` live |
| 273 | `.card-body` | `class` in `home.html`, `office.html`, `help.html`, `setup.html` |
| 281 | `.btn` | `class` in all HTML files; `classList` in `license.js`, tpl. in `renderer.js` |
| 297 | `.btn:disabled` | base `.btn` live |
| 302 | `.btn-primary` | `class` in HTML files; template in `renderer.js`, `index.js` |
| 307 | `.btn-primary:hover:not(:disabled)` | base `.btn-primary` live |
| 311 | `.btn-secondary` | `class` in all HTML files |
| 316 | `.btn-secondary:hover:not(:disabled)` | base `.btn-secondary` live |
| 320 | `.btn-success` | `class` in HTML files |
| 325 | `.btn-success:hover:not(:disabled)` | base `.btn-success` live |
| 329 | `.btn-danger` | `class` in `home.html` |
| 334 | `.btn-danger:hover:not(:disabled)` | base `.btn-danger` live |
| 338 | `.btn-outline` | `class` in HTML files |
| 344 | `.btn-outline:hover:not(:disabled)` | base `.btn-outline` live |
| 349 | `.btn-lg` | `class` in `index.html` |
| 354 | `.btn-sm` | `class` in `home.html`, `help.html`, `office.html` |
| 359 | `.btn-block` | `class` in `home.html` |
| 367 | `.status-badge` | `class` in HTML files; template in `renderer.js`, `index.js`, `office.js`, `setup.js` |
| 424 | `.device-card` | `classList` / `querySelectorAll` in `renderer.js` |
| 479 | `.device-info-item` | tpl. in `renderer.js` |
| 522 | `.dashboard-grid` | `class` in `home.html`, `office.html` |
| 568 | `.control-panel` | `class` in `home.html`, `office.html` |
| 578 | `.control-buttons` | `class` in `home.html`, `office.html` |
| 490 | `.devices-grid` | `class` in `home.html`; `classList.*` in `renderer.js` |
| 597 | `.empty-state` | tpl. in `renderer.js`; `class` in `home.html` |
| 624 | `.toggle` | `class` in `home.html` |
| 631 | `.toggle input` | base `.toggle` live |
| 701 | `.form-group` | `class` in `home.html`, `help.html`; tpl. in `renderer.js` |
| 705 | `.form-group label` | base `.form-group` live |
| 713 | `.form-group input[type="text"]` | base `.form-group` live |
| 714 | `.form-group textarea` | base `.form-group` live |
| 715 | `.form-group select` | base `.form-group` live |
| 727 | `.form-group input:focus` | base `.form-group` live |
| 728 | `.form-group textarea:focus` | base `.form-group` live |
| 729 | `.form-group select:focus` | base `.form-group` live |
| 734 | `.form-actions` | `class` in `home.html` |
| 747 | `.spinner` | tpl. in `renderer.js`, `office.js` |
| 1055 | `.flex` | `class` in `office.html`, `home.html` |
| 1053 | `.hidden` | `classList` in `renderer.js`, `setup.js`, `office.js`, `license.js` |
| 1091 | `.fade-in` | — |
| 1040 | `.text-center` | `class` in `office.html`; tpl. in `renderer.js` |
| 1041 | `.text-muted` | tpl. in `renderer.js`, `office.js` inline template strings |
| 1042 | `.text-error` | tpl. in `renderer.js` |
| 1043 | `.text-warning` | tpl. in `renderer.js` |
| 1044 | `.text-success` | tpl. in `renderer.js` |
| 1046 | `.mt-1` | `class` in `home.html`, `setup.html` |
| 1047 | `.mt-2` | `class` in `home.html` |
| 1048 | `.mt-3` | `class` in `home.html`, `about.html` |
| 1049 | `.mb-1` | `class` in `help.html` |
| 1050 | `.mb-2` | `class` in `home.html` |
| 1051 | `.mb-3` | `class` in `home.html` |

---

## Uncertainties (3 rules — referenced but live-provenness is weak)

| Line | Selector | Suspicious because… |
|------|----------|----------------------|
| 994 | `.text-center` | Used verbatim in a `renderer.js` template string (`showShortcuts`), but no HTML file directly has `class="text-center"`. Live dynamically via `innerHTML` injection — **likely live**, low risk. |
| 1041 | `.text-muted` | Applied as `class="status-badge status-unknown"` shorthand in HTML but `.text-muted` appears in `office.js` template strings inline (hardcoded `style="color: var(--text-muted)"` also used). Existing usage is via CSS variable fallback not class name — **could be stale**, verify usage before removal. |
| 605 | `.shortcut-list` | Only loaded dynamically via `renderDeviceCards` / `showShortcuts` innerHTML in `renderer.js`; no direct HTML `class="shortcut-list"` attribute exists in any `.html` file. Safe with lesson/dynamic-injection but worth noting. |
