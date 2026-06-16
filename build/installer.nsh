; Phone Farm — NSIS Installer Custom Script
; Referenced from package.json → build.nsis.script
;
; Electron-builder integration macros:
;   customInit     — called early in .onInit (before UI)
;   customInstall  — called during the install section
;   customUnInstall — called during the uninstall section
;
; Defines provided by electron-builder at build time:
;   ${APP_GUID}, ${APP_PUBLISHER}, ${APP_PRODUCT_NAME}

; ── License page ──────────────────────────────────────────────
!define MUI_PAGE_HEADER_TEXT "License Agreement"
!define MUI_LICENSEPAGE_TEXT_TOP "Please review the license terms before installing Phone Farm."

; ── Install directory page ────────────────────────────────────
!define MUI_DIRECTORYPAGE_TEXT_TOP "Setup will install Phone Farm in the following folder."

; ═══════════════════════════════════════════════════════════════
; INSTALLER INTEGRATION
; ═══════════════════════════════════════════════════════════════

; ── customInit ────────────────────────────────────────────────
; Called early in .onInit, before the installer UI is shown.
; ADB ve Python paket içinde gömülü olduğu için ön koşul kontrolü gerekmez.
!macro customInit
  DetailPrint "Phone Farm ${APP_VERSION} kuruluyor..."
!macroend

; ── customInstall ─────────────────────────────────────────────
; Called during the install process, after files are extracted.
; Reserved for future post-extraction steps.
!macro customInstall
  ; No additional install steps at this time.
!macroend

; ═══════════════════════════════════════════════════════════════
; UNINSTALLER INTEGRATION
; ═══════════════════════════════════════════════════════════════

; ── customUnInstall ───────────────────────────────────────────
; Called during uninstallation. Cleans up registry entries.
!macro customUnInstall
  ; Remove the uninstaller registry key
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
  ; Remove application settings from registry
  DeleteRegKey HKCU "Software\${APP_PUBLISHER}\${APP_PRODUCT_NAME}"
  ; NOTE: User data under %APPDATA%\${APP_PRODUCT_NAME} is intentionally
  ; left intact so the user does not lose configuration/databases on
  ; reinstall. Uncomment the line below to remove it:
  ; RMDir /r "$APPDATA\${APP_PRODUCT_NAME}"
!macroend
