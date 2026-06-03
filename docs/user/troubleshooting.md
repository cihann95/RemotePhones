# Troubleshooting

## No Devices Found

`python phone_farm_cli.py discover` returns nothing.

- Make sure USB Debugging is enabled on your phone (see [Getting Started](getting-started.md)).
- Try a different USB cable. Some cables only charge and do not carry data.
- Run `adb devices` directly. If that also shows nothing, the problem is with ADB, not Phone Farm.
- Reboot your phone and PC.

## ADB Not Found

You get `'adb' is not recognized` or `command not found`.

- Download [platform-tools](https://developer.android.com/studio/releases/platform-tools) from Google.
- Extract it and add the folder to your system PATH.
- Restart your terminal after updating PATH.

## Device Shows as Offline

The device serial appears in `adb devices` with status `offline`.

- Disconnect and reconnect the USB cable.
- Revoke USB Debugging authorizations on your phone and accept the prompt again.
- Restart the ADB server: `adb kill-server` then `adb start-server`.

## Task Fails

A task starts but ends with an error.

- Run a health check first: `python phone_farm_cli.py health <device_id>`.
- Check the job status: `python phone_farm_cli.py status <job_id>`.
- Make sure the device screen is on and unlocked for tasks that need UI interaction.

## Phone Call Fails

The call task returns an error.

- Verify the number format: use `+905XXXXXXXXX` or `05XXXXXXXXX`.
- Check that the device has a SIM card and network signal.
- Run a health check to confirm the device responds.

## GUI Won't Start

The Electron GUI does not open.

- Make sure Node.js is installed. Run `node --version`.
- Run `npm install` in the project root to install dependencies.
- Check the terminal for error messages. Missing dependencies are the most common cause.

## Still Stuck?

- Review the [CLI Reference](cli-reference.md) for correct command syntax.
- Check the [Glossary](glossary.md) for unfamiliar terms.
