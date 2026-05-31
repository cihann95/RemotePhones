# Phone Farm — Agent Coordination

## Ownership Map
| Directory / File         | Owner       | Other agent |
|--------------------------|-------------|-------------|
| core/                    | OpenCode | READ-ONLY   |
| config/                  | OpenCode | READ-ONLY   |
| utils/                   | OpenCode | READ-ONLY   |
| requirements.txt         | OpenCode | NO ACCESS   |
| README.md                | OpenCode | NO ACCESS   |
| AGENTS.md                | OpenCode | READ-ONLY   |
| OPENCODE_LOG.md            | OpenCode | READ-ONLY   |
| scheduler/               | Kilo Code   | NO ACCESS   |
| automations/             | Kilo Code   | NO ACCESS   |
| tasks/                   | Kilo Code   | NO ACCESS   |
| monitor/                 | Kilo Code   | NO ACCESS   |
| KILO_LOG.md              | Kilo Code   | READ-ONLY   |

## Shared Interface Contract
> These APIs are the boundary between both agents. Never change signatures without updating this file AND notifying via your log.

- `core.device_manager.DeviceManager` — main class, all device ops
- `core.adb.ADBClient` — raw ADB wrapper
- `utils.logger.get_logger(name)` — standard logger factory
- `config.loader.load_config(path=None)` — returns typed config dict

## Pending Interface Changes
> Kilo Code: write requests here. OpenCode: acknowledge and implement.

```
REQUESTED BY: Kilo Code
NEED: Add fastapi>=0.103.0 (pin fastapi==0.115.6) to requirements.txt
REASON: monitor/api.py serves FastAPI health/queue/status endpoints.
         FastAPI 0.95.2 installed on reviewer's machine is incompatible with
         pydantic 2.13 (Undefined was removed from pydantic.fields in 2.10+).
         0.115.x works with pydantic 2.13+ and is a minor upgrade.
BLOCKING: no — python-level imports of all other 15 modules verified clean;
           monitor/api.py can be imported even without a working FastAPI (routes
           raise HTTP 503 at call time). Prevents CI / smoke-test breakage.

```
REQUESTED BY: Kilo Code
NEED: [ACKNOWLEDGED — done by Kilo Code]
```

## Status
- OpenCode: IDLE
- Kilo Code: IDLE
