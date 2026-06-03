# Getting Started

## Prerequisites

- A Windows PC.
- A USB cable to connect your phone.
- An Android phone with USB Debugging enabled.
- Python 3.8 or newer installed on your PC.

## Step-by-Step Setup

### 1. Install Python

Download Python 3.8 or newer from the [official website](https://python.org). During installation, check "Add Python to PATH." Open a terminal and verify:

```
python --version
```

### 2. Install ADB

ADB (Android Debug Bridge) lets your computer talk to your phone. Download the platform-tools from Google:

- [Download platform-tools](https://developer.android.com/studio/releases/platform-tools)

Extract the ZIP file to a folder like `C:\platform-tools`. Add that folder to your system PATH so the `adb` command works from any terminal.

### 3. Enable USB Debugging on Your Phone

1. Open **Settings > About Phone** on your Android phone.
2. Tap **Build Number** seven times until you see "You are now a developer."
3. Go back to **Settings > Developer Options**.
4. Toggle **USB Debugging** on.
5. Connect your phone to the PC with a USB cable.
6. When prompted, accept the RSA key fingerprint on your phone.

### 4. Clone the Project

```
git clone https://github.com/cihann95/RemotePhones.git
cd RemotePhones
```

### 5. Install Python Dependencies

```
pip install -r requirements.txt
```

### 6. Connect Your Phone

Plug in your phone and allow USB Debugging if prompted. Check that ADB sees it:

```
adb devices
```

You should see your device serial number.

### 7. Discover Devices with Phone Farm

```
python phone_farm_cli.py discover
```

Phone Farm scans for connected devices and lists them. You are ready to move on.

## Next Steps

- [Setup Wizard](setup-wizard.md): Launch the Electron GUI and configure your farm.
- [Device Management](device-management.md): Run health checks and tasks.
- [CLI Reference](cli-reference.md): Learn all available commands.
