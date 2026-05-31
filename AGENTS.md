# Phone Farm — Agent Coordination

## Agent Roster
| Agent               | Tool      | Model           | Birincil Mod       |
|---------------------|-----------|-----------------|--------------------|
| Infrastructure      | OpenCode  | MiMo V2.5       | Otonom koşu        |
| Automation Coder    | Kilo Code | Laguna M.1      | Code               |
| Architect           | Kilo Code | Nemotron 3 Super| Architect          |
| Debug & Monitor     | Kilo Code | Step 3.7 Flash  | Debug              |

## Ownership Map
| Dizin / Dosya         | Sahip               | Diğerleri       |
|-----------------------|---------------------|-----------------|
| core/                 | OpenCode (MiMo)     | READ-ONLY       |
| config/               | OpenCode (MiMo)     | READ-ONLY       |
| utils/                | OpenCode (MiMo)     | READ-ONLY       |
| requirements.txt      | OpenCode (MiMo)     | YASAK           |
| README.md             | OpenCode (MiMo)     | YASAK           |
| AGENTS.md             | OpenCode (MiMo)     | READ-ONLY       |
| OPENCODE_LOG.md       | OpenCode (MiMo)     | READ-ONLY       |
| scheduler/            | Kilo/Laguna         | YASAK (OpenCode)|
| automations/          | Kilo/Laguna         | YASAK (OpenCode)|
| tasks/                | Kilo/Laguna         | YASAK (OpenCode)|
| monitor/              | Kilo/Step           | YASAK (OpenCode)|
| docs/architecture/    | Kilo/Nemotron       | READ-ONLY       |
| LAGUNA_LOG.md         | Kilo/Laguna         | READ-ONLY       |
| NEMOTRON_LOG.md       | Kilo/Nemotron       | READ-ONLY       |
| STEP_LOG.md           | Kilo/Step           | READ-ONLY       |

## Shared Interface Contract
> Aşağıdaki API'lar tüm ajanlar arası sınırdır.
> İmza değişikliği → önce AGENTS.md güncelle, sonra tüm ajanlara bildir.

- `core.device_manager.DeviceManager`
- `core.adb.ADBClient` + `AsyncADBClient`
- `core.adb.ADBClient.run_command(cmd: str, timeout: int, retries: int) -> str`
- `utils.logger.get_logger(name: str) -> Logger`
- `config.loader.load_config(path: str | None) -> dict`

## Pending Interface Changes
(yok)

## Status
- OpenCode (MiMo):      WORKING
- Kilo (Laguna):        IDLE
- Kilo (Nemotron):      IDLE
- Kilo (Step):          IDLE
