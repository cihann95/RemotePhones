# Setup Wizard

The Setup Wizard runs the first time you start the Electron GUI. It helps you choose your operating mode and configure your farm.

## Starting the GUI

Run either of these:

```
npm start
```

Or double-click `launch.bat`.

## Home Mode (EV)

Choose **EV (Home Mode)** if you are running Phone Farm from your personal computer with a few phones connected directly via USB. This mode is simple. You see all connected devices in a list and can run tasks on them right away.

Home mode is good for testing, small setups, and personal projects.

## Office Mode (OFIS)

Choose **OFIS (Office Mode)** if you manage phones across a network. Devices can connect through Tailscale or Parsec. You get a dashboard with remote device status, job queues, and scheduling.

Office mode is for larger farms with many devices spread across different locations.

## The Main Screen

After setup, you see the main window with these sections:

- **Device List**: Shows every connected phone. Each entry shows the device serial, model name, and connection status.
- **Farm Controls**: Use Start Farm to begin monitoring devices. Use Stop Farm to pause.
- **Task Panel**: Run tasks on selected devices or view running jobs.

## Switching Modes

You can switch between Home and Office mode later in the Settings panel. Changing mode restarts the device list.

## What's Next

- [Device Management](device-management.md): Learn how to run health checks and tasks.
- [Troubleshooting](troubleshooting.md): Fix issues if the GUI does not start.
