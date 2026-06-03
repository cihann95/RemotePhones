# Device Management

## Connecting a Phone

1. Enable USB Debugging on your Android phone (see [Getting Started](getting-started.md)).
2. Plug your phone into the PC with a USB cable.
3. Accept the RSA key prompt on your phone.
4. Run `adb devices` to confirm the device shows up.

## Discovering Devices

Tell Phone Farm to scan for all connected phones:

```
python phone_farm_cli.py discover
```

This prints a list of device serial numbers. Each serial uniquely identifies a phone.

## Running a Health Check

A health check verifies that a device is responding and has basic functionality:

```
python phone_farm_cli.py health <device_id>
```

Replace `<device_id>` with the serial number from the discover step. The output shows battery level, Android version, signal strength, and connection quality.

## Running a Task

Phone Farm can run automation tasks on devices. Available tasks include screen unlock, app launch, and phone calls.

```
python phone_farm_cli.py run <device_id> <task_name>
```

Add parameters with `--param key=value`. For example:

```
python phone_farm_cli.py run <device_id> call --param number=+905XXXXXXXXX
```

## Checking Task Status

Each task you run gets a job ID. Check its progress:

```
python phone_farm_cli.py status <job_id>
```

The output shows whether the job is pending, running, completed, or failed.

## Related Docs

- [Phone Calls](phone-calls.md): Make and manage calls on devices.
- [CLI Reference](cli-reference.md): All commands and options.
- [Troubleshooting](troubleshooting.md): Fix device connection issues.
