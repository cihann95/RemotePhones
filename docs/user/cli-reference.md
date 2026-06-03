# CLI Reference

All commands are run from the project root with `python phone_farm_cli.py`.

## discover

Scan for connected Android devices.

```
python phone_farm_cli.py discover
```

Outputs a list of device serial numbers. Run this first to find your device IDs.

## health

Run a health check on a device to verify it is responsive.

```
python phone_farm_cli.py health <device_id>
```

Shows battery level, Android version, signal strength, and connection quality.

## run

Execute a task on a device.

```
python phone_farm_cli.py run <device_id> <task_name> [--param key=value]
```

Example: make a phone call.

```
python phone_farm_cli.py run <device_id> call --param number=+905XXXXXXXXX
```

Other tasks: `answer`, `reject`, `hangup`, `unlock`.

## submit

Submit a batch job from a CSV file.

```
python phone_farm_cli.py submit <csv_file>
```

The CSV must contain a `phone` column. Phone Farm processes each row as a task. See [Phone Calls](phone-calls.md) for the CSV format.

## status

Check the status of a submitted job.

```
python phone_farm_cli.py status <job_id>
```

Returns one of: `pending`, `running`, `completed`, `failed`.

## call (shortcut)

A shortcut to run the `call` task without specifying the task name explicitly.

```
python phone_farm_cli.py call <device_id> --number=+905XXXXXXXXX
```

This is equivalent to the `run` command with the `call` task.

## Related Docs

- [Device Management](device-management.md): Detailed usage of run and health commands.
- [Phone Calls](phone-calls.md): Making calls and bulk operations.
- [Getting Started](getting-started.md): Installation and first steps.
