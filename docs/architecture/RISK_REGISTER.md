# Risk Register

## Kritik (hemen ele alınmalı)
| # | Risk | Etkilenen | Sahip Ajan | Öneri |
|---|------|-----------|------------|-------|
| 1 | ~~ManagerProtocol and RegistryProtocol mismatch~~ RESOLVED | core.plugins.base_plugin.py, scheduler/manager.py, tasks/registry.py | OpenCode (defines protocols), Kilo/Laguna (implemented) | Kilo/Laguna implemented ManagerProtocol and RegistryProtocol in PhoneFarmManager and TaskRegistry respectively. |
| 2 | ~~Cross-zone imports in core/plugins/base_plugin.py~~ RESOLVED | core/plugins/base_plugin.py | OpenCode | Cross-zone imports removed, protocols use TYPE_CHECKING pattern. |
| 3 | Monitor layer uses shell_output bypassing retry logic | monitor/health.py | Kilo/Step | Change HealthChecker to use ADBClient.run_command instead of shell_output, or add retry logic to shell_output usage. |

## Orta (sprint planına al)
| # | Risk | Etkilenen | Sahip Ajan | Öneri |
|---|------|-----------|------------|-------|
| 1 | Lack of explicit interface for scheduler's JobQueue and TaskRunner | scheduler/job_queue.py, scheduler/runner.py | Kilo/Laguna | ~~Define a clear interface for these components if they are to be used by other layers.~~ Future enhancement. |
| 2 | ~~Inconsistent use of ADBClient methods~~ RESOLVED | Throughout codebase | All | Automations now use run_command consistently. |

## Düşük (backlog)
| # | Risk | Etkilenen | Sahip Ajan | Öneri |
|---|------|-----------|------------|-------|
| 1 | Lack of explicit interface for scheduler's JobQueue and TaskRunner | scheduler/job_queue.py, scheduler/runner.py | Kilo/Laguna | Define a clear interface for these components if they are to be used by other layers. |
| 2 | Inconsistent use of ADBClient methods (some use shell_output, some run_command) | Throughout codebase | All | Standardize on using run_command for all ADB commands to ensure consistent retry and timeout handling. |

## Düşük (backlog)
| # | Risk | Etkilenen | Sahip Ajan | Öneri |
|---|------|-----------|------------|-------|
| 1 | Missing async ADB client implementation | core/async/adb.py | OpenCode | Ensure AsyncADBClient is fully implemented and matches the interface of ADBClient. |
| 2 | Configuration validation may fail silently | config/loader.py | OpenCode | Improve error handling and logging when config validation fails. |
| 3 | Logger initialization may cause duplicate handlers | utils/logger.py | OpenCode | Ensure logger setup is idempotent.