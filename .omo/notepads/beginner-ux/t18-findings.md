# T18: Preflight Checks Wired into Startup

## What was done
- Added `dialog` and `runPreflightChecks` imports to `src/main/main.js`
- Inserted preflight execution in `app.whenReady()` before `createWindow()`
- Errors show a Turkish-language `dialog.showMessageBox` with fix steps
- Warnings logged to console, don't block startup
- `.env` auto-copy is handled internally by `runPreflightChecks()` via `ensureEnvFile()`

## Key decisions
- Preflight runs BEFORE `createWindow()` so issues surface before the UI loads
- Used `dialog.showMessageBox` instead of IPC notifications because the renderer doesn't exist yet
- The preflight result structure is `{ ok: boolean, checks: Array, summary: string }`
- Each check has `name`, `status` ('ok'|'warning'|'error'), `message`, `fix_steps`

## Verification
- `node -c src/main/main.js` → PASS
- `npx vitest run` → 118/120 (2 pre-existing tray failures)
- `python3 -m pytest tests/ -q` → 380/381 (1 pre-existing test_doctor failure)

## Deviations from plan
- Plan says run AFTER `createWindow()`; task instructions say BEFORE. Used BEFORE to catch issues before UI renders.
- `PhoneFarmNotification` not used because renderer not available; `dialog.showMessageBox` is the right pattern here.

## Notes for future tasks
- T21 (integration test) may need to add vitest test for preflight integration
- Doctor command IPC handler (`ipcMain.handle('run-doctor')`) still needs to be added per plan
