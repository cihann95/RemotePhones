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
; PREREQUISITE CHECK MACROS
; ═══════════════════════════════════════════════════════════════

; ── ADB platform-tools check ─────────────────────────────────
; Warns the user if ADB is not found on PATH. This is a soft
; warning — installation continues either way.
!macro CheckADB
  DetailPrint "Checking for ADB (Android Debug Bridge)..."
  nsExec::ExecToStack 'cmd /c "where adb >nul 2>nul"'
  Pop $0
  IntCmp $0 0 adb_found adb_not_found adb_not_found
  adb_not_found:
    MessageBox MB_ICONEXCLAMATION \
      "ADB (Android Debug Bridge) was not found on your PATH.$\n$\n\
      Phone Farm requires ADB to communicate with Android devices.$\n$\n\
      Download platform-tools from:$\n\
      https://developer.android.com/studio/releases/platform-tools" \
      /SD IDOK
    Goto adb_done
  adb_found:
    DetailPrint "  ✓ ADB found."
  adb_done:
!macroend

; ── Python check ──────────────────────────────────────────────
; Warns the user if Python 3 is not found on PATH.
!macro CheckPython
  DetailPrint "Checking for Python 3..."
  nsExec::ExecToStack 'cmd /c "python --version >nul 2>nul"'
  Pop $0
  IntCmp $0 0 python_found python_not_found python_not_found
  python_not_found:
    MessageBox MB_ICONEXCLAMATION \
      "Python 3.10 or newer was not found on your PATH.$\n$\n\
      Phone Farm requires Python 3.10+ to run the backend.$\n$\n\
      Download Python from:$\n\
      https://www.python.org/downloads/" \
      /SD IDOK
    Goto python_done
  python_found:
    DetailPrint "  ✓ Python found."
  python_done:
!macroend

; ═══════════════════════════════════════════════════════════════
; INSTALLER INTEGRATION
; ═══════════════════════════════════════════════════════════════

; ── customInit ────────────────────────────────────────────────
; Called early in .onInit, before the installer UI is shown.
; This is the right place for prerequisite checks.
!macro customInit
  !insertmacro CheckADB
  !insertmacro CheckPython
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
