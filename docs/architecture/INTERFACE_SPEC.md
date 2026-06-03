# Phone Farm — Interface Specifications

## core → scheduler (OpenCode → Kilo/Laguna)
### DeviceManager API
- `__init__(self, adb_client: ADBClient) -> None`
- `discover(self) -> List[str]`
- `register(self, device_id: str, metadata: Optional[Dict] = None) -> Dict`
- `connect(self, device_id: str) -> Dict`
- `disconnect(self, device_id: str) -> None`
- `remove(self, device_id: str) -> None`
- `get(self, device_id: str) -> Optional[Dict]`
- `all_devices (property) -> Dict[str, Dict]`
- `online_devices (property) -> Dict[str, Dict]`

### ADBClient API
- `__init__(self, adb_path: str = "adb", default_device: Optional[str] = None, max_retries: int = 3, retry_delay: float = 1.0) -> None`
- `devices(self) -> List[str]`
- `shell_output(self, command: str, device_id: Optional[str] = None, timeout: int = 30) -> str`
- `run_command(self, args: List[str], device_id: Optional[str] = None, timeout: int = 30) -> str`
- `tap(self, x: int, y: int, device_id: Optional[str] = None) -> None`
- `swipe(self, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300, device_id: Optional[str] = None) -> None`
- `screencap(self, path: str = "/sdcard/screen.png", device_id: Optional[str] = None) -> None`
- `pull(self, remote: str, local: str, device_id: Optional[str] = None) -> None`
- `push(self, local: str, remote: str, device_id: Optional[str] = None) -> None`
- `install(self, apk_path: str, device_id: Optional[str] = None) -> None`
- `uninstall(self, package: str, device_id: Optional[str] = None) -> None`
- `launch(self, package: str, activity: str, device_id: Optional[str] = None) -> None`

### AsyncADBClient
(Same as ADBClient but async methods)

### Logger
- `get_logger(name: str, level: int | str = logging.INFO) -> logging.Logger`

### Config Loader
- `load_config(path: str | None = None) -> dict[str, Any]`

## core → tasks (OpenCode → Kilo/Laguna)
### ManagerProtocol (from core/plugins/base_plugin.py)
- `get_devices(self) -> list`
- `run_task(self, task_id: str, device_id: str) -> bool`

### RegistryProtocol (from core/plugins/base_plugin.py)
- `get_task(self, task_id: str) -> object`
- `list_tasks(self) -> list[str]`

## core → scheduler (JobQueue & TaskRunner) (OpenCode → Kilo/Laguna)
### JobQueueProtocol
- enqueue(self, task_name: str, priority: int | str, payload: dict) -> dict
- dequeue(self) -> dict | None
- qsize(self) -> int

### TaskRunnerProtocol
- start(self) -> None
- stop(self, timeout: float = 5.0) -> None

## core → monitor (OpenCode → Kilo/Step)
### ADBClient.run_command()
- Parameters: `args: List[str], device_id: Optional[str] = None, timeout: int = 30`
- Returns: `str` (captured stdout)
- Timeout behavior: raises `subprocess.TimeoutExpired` after `timeout` seconds
- Retry semantics: exponential backoff with configurable `max_retries` and `retry_delay`
- Error types: `subprocess.TimeoutExpired`, `FileNotFoundError`

### ADBClient.shell_output()
- Parameters: `command: str, device_id: Optional[str] = None, timeout: int = 30`
- Returns: `str` (captured stdout)
- Used by: monitor layer, device_manager, mobile_ops, platform.py
- Note: Does NOT have retry logic (unlike run_command). Consider migrating callers to run_command for consistency.

## core → tüm agentlar (OpenCode → Kilo/*)
### StatusBoardProtocol
- write_entry(self, agent: str, message: str) -> None
- read_entries(self) -> list[str]
- clear(self) -> None

## Eksik interface'ler
- ~~No explicit interface for the scheduler's JobQueue and TaskRunner to the core.~~ **RESOLVED** — JobQueueProtocol and TaskRunnerProtocol added to core/plugins/base_plugin.py and AGENTS.md.
- ~~The monitor layer uses `shell_output` which is not in the shared interface contract (only `run_command` is listed).~~ **RESOLVED** — `shell_output` added to AGENTS.md interface contract.
- ~~The `ManagerProtocol` and `RegistryProtocol` in core/plugins/base_plugin.py are not implemented by the actual scheduler/manager.py and tasks/registry.py (they have different method names and signatures).~~ **RESOLVED** — Kilo/Laguna already implemented: `PhoneFarmManager(ManagerProtocol)` at scheduler/manager.py:41, `TaskRegistry(RegistryProtocol)` at tasks/registry.py:14.

