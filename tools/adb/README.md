# ADB Binary for Phone Farm

This directory contains the bundled ADB (Android Debug Bridge) binary for Windows x64.

## Current Binary

- **File**: `adb.exe`
- **Version**: platform-tools r34.0.5
- **Size**: ~5.6 MB
- **Platform**: Windows x64

## How It Works

Phone Farm bundles ADB so users don't need to install it separately. The Electron app
uses this binary via `ADBManager` (in `src/main/adb.js`) which extends `BaseToolManager`.

### Path Discovery

- **Production** (installed app): `process.resourcesPath/tools/adb/adb.exe`
- **Development** (npm start): Searches `tools/adb/adb.exe` relative to project root
- **Python fallback**: `core/adb.py` searches bundled paths before falling back to PATH

### Build Integration

`package.json` `build.extraResources` copies `tools/` → `resources/tools/` during packaging.

## Replacing or Updating ADB

### Option 1: Download from Google (recommended)

1. Visit https://developer.android.com/studio/releases/platform-tools
2. Download the latest Windows platform-tools ZIP
3. Extract `platform-tools/adb.exe` to this directory (replacing the existing file)
4. Verify: `tools\adb\adb.exe version`

### Option 2: Copy from Android SDK

If you have Android Studio installed:

```
copy "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" tools\adb\adb.exe
```

### Option 3: Copy from system ADB

```
where adb
copy <path-from-where> tools\adb\adb.exe
```

## Verification

After replacing, verify the binary is valid:

```powershell
# Check file exists and is > 1MB
Get-Item tools\adb\adb.exe | Select-Object Length

# Check MZ header (should print "MZ")
$bytes = [System.IO.File]::ReadAllBytes("tools\adb\adb.exe")[0..1]
[System.Text.Encoding]::ASCII.GetString($bytes)

# Test it runs
tools\adb\adb.exe version
```

## Notes

- Only `adb.exe` is needed — fastboot and other tools are NOT bundled
- The binary is Windows x64 only (no macOS/Linux bundles)
- Do NOT auto-download at runtime — this is a build/setup-time binary only
