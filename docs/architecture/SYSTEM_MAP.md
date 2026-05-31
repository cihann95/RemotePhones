# Phone Farm — System Map

## Modül bağımlılık grafiği
- core.device_manager.DeviceManager -> core.adb.ADBClient, utils.logger.get_logger
- core.adb.ADBClient -> (no external dependencies beyond stdlib)
- utils.logger.get_logger -> (optional loguru, else stdlib)
- config.loader.load_config -> utils.logger.get_logger (lazy), pydantic (optional), yaml
- core.plugins.base_plugin.BasePlugin -> core.adb.ADBClient, core.device_manager.DeviceManager, utils.logger.get_logger
- scheduler.manager.PhoneFarmManager -> core.adb.ADBClient, core.device_manager.DeviceManager, scheduler.job_queue.JobQueue, scheduler.priority.Priority, scheduler.runner.TaskRunner, tasks.concrete.register_all, tasks.registry.TaskRegistry
- scheduler.job_queue.JobQueue -> (likely queue, threading)
- scheduler.runner.TaskRunner -> tasks.base_task.BaseTask, threading
- tasks.registry.TaskRegistry -> tasks.base_task.BaseTask
- tasks.base_task.BaseTask -> (abstract, used by concrete tasks)
- automations.instagram.InstagramFollowTask -> core.mobile_ops.MobileOperations, tasks.base_task.BaseTask
- core.mobile_ops.MobileOperations -> core.adb.ADBClient
- monitor.health.HealthChecker -> core.adb.ADBClient (via constructor)

## Veri akışı
1. ADB komutu (örn. `adb devices`) -> core.adb.ADBClient.run_command or shell_output
2. core.device_manager.DeviceManager uses ADBClient to discover and connect devices
3. scheduler.manager.PhoneFarmManager uses DeviceManager to get device list and connect devices
4. PhoneFarmManager enqueues tasks via JobQueue
5. scheduler.runner.TaskRunner dequeues jobs and instantiates tasks from TaskRegistry
6. Task (e.g., InstagramFollowTask) receives device_manager and uses it to get ADBClient for device operations
5. monitor.health.HealthChecker uses ADBClient directly to run health check commands

## Soyutlama sınırları
- ~~core.plugins.base_plugin defines ManagerProtocol and RegistryProtocol that should be implemented by Kilo/Laguna's scheduler/manager.py and tasks/registry.py, but current implementations do not fully match the protocol signatures.~~ **RESOLVED** — Kilo/Laguna already implemented both protocols (PhoneFarmManager(ManagerProtocol), TaskRegistry(RegistryProtocol)).
- The monitor layer uses core.adb.ADBClient.shell_output, which is now explicitly listed in the interface contract (AGENTS.md).
- ~~There is a potential cross-zone import violation in core/plugins/base_plugin.py (if the imports from scheduler.manager and tasks.registry are present) creating a hard dependency from OpenCode's zone to Kilo's zones.~~ **RESOLVED** — Protocol refactor removed all cross-zone imports.

## Tespit edilen kırılma noktaları
- ~~[P0] ManagerProtocol and RegistryProtocol mismatch: plugins expecting these interfaces will not work with current scheduler/manager.py and tasks/registry.py.~~ **RESOLVED** — Kilo/Laguna already implemented both protocols.
- ~~[P0] If cross-zone imports exist in core/plugins/base_plugin.py (as logged in OPENCODE_LOG.md), this creates a hard dependency violating ownership rules.~~ **RESOLVED** — Protocol refactor removed all cross-zone imports.
- ~~[P1] Monitor layer using shell_output instead of run_command may bypass retry logic and other features of run_command.~~ **PARTIALLY RESOLVED** — `shell_output` added to interface contract. Migration to `run_command` is optional (monitor may not need retry for health checks).
- [P2] Lack of error handling in some ADB command usages (e.g., in automations/instagram.py, there are try-except blocks but some ADB calls are not wrapped).

## 4 ajanın dokunduğu kesişim noktaları
- AGENTS.md: written by OpenCode (MiMo), read by all agents to understand interface contracts.
- core.adb.ADBClient: written by OpenCode, used by scheduler/manager.py (Kilo/Laguna), automations/ (Kilo/Laguna), monitor/ (Kilo/Step), and core/plugins/base_plugin.py (OpenCode).
- core.device_manager.DeviceManager: written by OpenCode, used by scheduler/manager.py (Kilo/Laguna) and core/plugins/base_plugin.py (OpenCode).
- tasks/registry.TaskRegistry: written by Kilo/Laguna, used by scheduler/manager.py (Kilo/Laguna) and core/plugins/base_plugin.py (OpenCode via RegistryProtocol).
- scheduler.manager.PhoneFarmManager: written by Kilo/Laguna, used by core/plugins/base_plugin.py (OpenCode via ManagerProtocol).
- monitor/health.HealthChecker: written by Kilo/Step, uses core.adb.ADBClient (OpenCode)