# Phone Farm Backup

Phone Farm Backup is a platform for managing Android phones from your computer. It talks to devices over ADB (Android Debug Bridge), so you can run automated tasks, make calls, check device health, and monitor everything from a desktop GUI or command line.

---

## First Time?

If you have never used Phone Farm before, start with the [Getting Started guide](docs/user/getting-started.md). It covers installing Python, setting up ADB, enabling USB debugging on your phone, and connecting your first device.

---

## Quick Start

1. **Install Python 3.10 or newer** and make sure it is on your PATH.
2. **Install ADB** (platform-tools from Google) and add it to your PATH.
3. **Enable USB debugging** on your Android phone. Connect it to your computer with a USB cable.
4. **Clone and install:**
   ```
   git clone https://github.com/cihann95/RemotePhones.git
   cd RemotePhones
   pip install -r requirements.txt
   ```
5. **Run a health check:**
   ```
   python phone_farm_cli.py discover
   python phone_farm_cli.py health <device_id>
   ```

That is it. You should see your device's battery level, Android version, and connection status. For a deeper walkthrough, see the [Getting Started guide](docs/user/getting-started.md).

---

## Prerequisites

- **Python 3.10+** on your PATH
- **ADB** (Android Debug Bridge) installed and accessible from the command line
- A **USB cable** that supports data transfer
- An **Android phone** with USB Debugging enabled (Settings > Developer Options > USB Debugging)

---

## Installation

```bash
pip install -r requirements.txt
```

This installs all dependencies: ADB wrapper, job scheduler, FastAPI server, YAML config loader, and logging.

---

## CLI Usage

All commands run from the project root using `python phone_farm_cli.py`.

### discover

List every Android device connected to your computer.

```bash
python phone_farm_cli.py discover
```

Returns a JSON list of device serial numbers.

### health

Check if a device is responsive and get its status.

```bash
python phone_farm_cli.py health <device_id>
```

Shows battery level, Android version, signal strength, and connection quality.

### run

Execute a task on a device.

```bash
python phone_farm_cli.py run <device_id> <task_name> [--param key=value]
```

Example: make a phone call.

```bash
python phone_farm_cli.py run <device_id> call --param number=+905XXXXXXXXX
```

Other built-in tasks: `answer`, `reject`, `hangup`, `unlock`.

### call

Make a phone call to a single number or bulk from a CSV file.

```bash
python phone_farm_cli.py call <device_id> --number +905XXXXXXXXX
python phone_farm_cli.py call <device_id> --csv-file numbers.csv
```

### submit

Submit a batch job from a JSON steps file.

```bash
python phone_farm_cli.py submit <device_id> steps.json
```

### status

Check the status of a running or completed job.

```bash
python phone_farm_cli.py status <job_id>
python phone_farm_cli.py status --summary
```

For full details on every command, see the [CLI Reference](docs/user/cli-reference.md).

---

## GUI Usage

Phone Farm comes with an Electron desktop app that shows your devices in a visual grid.

### Starting the GUI

```
npm start
```

Or double-click `launch.bat`.

### Home Mode (EV)

Choose Home Mode when you run Phone Farm from a personal computer with a few phones connected directly via USB. You see all connected devices in a list and can run tasks on them immediately. This mode is good for testing, small setups, and personal projects.

### Office Mode (OFIS)

Choose Office Mode when you manage phones across a network. Devices can connect through Tailscale or Parsec. You get a dashboard with remote device status, job queues, and scheduling. This mode is for larger farms with devices in different locations.

### Device Grid

The main screen shows each connected phone. Each entry displays the device serial, model name, connection status, and live health data. Farm controls let you start and stop monitoring. The task panel lets you run operations on selected devices.

For more on the GUI, see the [Setup Wizard guide](docs/user/setup-wizard.md) and [Device Management](docs/user/device-management.md).

---

## API Reference

Phone Farm exposes a REST API through FastAPI for health checks and status monitoring.

### Starting the server

```bash
uvicorn monitor.api:app --reload
```

The server runs on port 8000 by default.

### Key endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/health/devices` | Health status of all devices |
| GET | `/health/devices/{device_id}` | Health status of a specific device |
| GET | `/status` | Manager and queue status |
| GET | `/queue` | List all queued jobs |
| GET | `/queue/{job_id}` | Status of a specific job |

---

## Troubleshooting

**No devices found.** Make sure USB Debugging is enabled. Try a different USB cable (some cables only charge). Run `adb devices` directly to confirm ADB sees your phone.

**ADB not found.** Download platform-tools from Google, extract them, and add the folder to your system PATH. Restart your terminal.

**Device shows as offline.** Disconnect and reconnect the USB cable. Revoke USB Debugging authorizations on your phone and accept the prompt again. Run `adb kill-server` then `adb start-server`.

**Task fails.** Run a health check first to confirm the device is responsive. Check the job status with `python phone_farm_cli.py status <job_id>`. Make sure the device screen is on and unlocked for tasks that need UI interaction.

For more solutions, see the [Troubleshooting guide](docs/user/troubleshooting.md).

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Make your changes.
4. Run the tests: `python -m pytest tests/`.
5. Commit and push.
6. Open a Pull Request.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

## Acknowledgments

- Android Debug Bridge (ADB) team
- Pure Python ADB library contributors
- FastAPI and Uvicorn teams
- All open-source dependencies used in this project
