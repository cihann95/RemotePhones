# Phone Calls

Phone Farm can make, answer, and manage phone calls on connected Android devices.

## Number Format

Use one of these formats when providing a phone number:

- International: `+905XXXXXXXXX`
- Local with leading zero: `05XXXXXXXXX`

Phone Farm normalizes both formats before dialing.

## Making a Single Call

```
python phone_farm_cli.py run <device_id> call --param number=+905XXXXXXXXX
```

The device dials the number. You can monitor call state with the status command.

## Making Bulk Calls from a CSV

Prepare a CSV file with a column named `phone`. Each row contains one number:

```csv
phone
+905551111111
+905552222222
+905553333333
```

Then run:

```
python phone_farm_cli.py submit calls.csv
```

Phone Farm processes each number through available devices. You get a job ID for tracking.

## Answering and Rejecting Calls

When an incoming call arrives on a monitored device:

- Use the GUI to click **Answer** or **Reject**.
- Or run a task: `python phone_farm_cli.py run <device_id> answer` or `python phone_farm_cli.py run <device_id> reject`.

## Hanging Up

End an active call:

```
python phone_farm_cli.py run <device_id> hangup
```

## Monitoring Call State

Check what a call is doing at any time:

```
python phone_farm_cli.py status <job_id>
```

States include: `dialing`, `ringing`, `active`, `completed`, `failed`.

## Related Docs

- [Device Management](device-management.md): Run health checks and tasks.
- [CLI Reference](cli-reference.md): Full command reference.
- [Troubleshooting](troubleshooting.md): Fix call failures.
