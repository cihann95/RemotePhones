# Phone Farm — Agent Coordination

**Generated:** 2026-06-01T00:00:00Z
**Commit:** 828a23d
**Branch:** main

## OVERVIEW
The Phone Farm Backup project is a comprehensive automation platform for managing and controlling fleets of Android devices via ADB. It combines a Python-based backend for device management, task scheduling, and automation with an Electron-based desktop GUI for real-time monitoring and control.

## STRUCTURE
```
Phone Farm Backup/
├── core/          # Core device management and ADB communication
├── scheduler/     # Job queue and task scheduling system
├── tasks/         # Concrete automation task implementations
├── automations/   # Pre-built automation task bundles
├── monitor/       # REST API for health monitoring and device status
├── utils/         # Utility functions and helpers
├── src/           # Electron frontend (main and renderer processes)
├── tests/         # Test suite for Python backend
└── caveman/       # Embedded caveman skill for output compression (vendor)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Run health check on a device | `phone_farm_cli.py health <device_id>` | CLI command |
| View real-time device status | `launch.bat` or `npm start` | Starts Electron GUI |
| Add a new automation task | `tasks/` directory | Implement BaseTask subclass |
| Configure device polling intervals | `config/phone_farm_farm.yaml` | Main configuration file |
| Run the test suite | `python -m pytest tests/` | Execute all Python tests |
| Build Docker image | `docker build -t phone-farm .` | From project root |
| Modify caveman compression rules | `caveman/skills/caveman-compress/` | Skill implementation |
| View agent coordination rules | `AGENTS.md` | This file |
| Check forbidden zones between agents | `*_PROMPT.md` files | OpenCode, Kilo, Claude Code prompts |

## CONVENTIONS
- Python project lacks `pyproject.toml`, `setup.py`, or `setup.cfg` — no packaging configuration.
- Line length is 88 (flake8) vs Python default 79.
- MyPy strict mode enabled: `disallow_untyped_defs = true`, etc.
- No JS/TS linting configuration (ESLint, Prettier) in the Electron app.
- No EditorConfig file.
- README.md has encoding corruption.
- Virtual environment (`ajan-ortam/`) committed to the repo.
- Build artifacts (`dist/`) present in the repo.
- Empty directories committed without `.gitkeep`.
- Duplicate caveman script tree.
- Dead code in `phone_farm_cli.py` (`cmd_submit_file` function).
- `__init__.py` files are mostly placeholders (only monitor/ and scheduler/ have proper exports).
- `conftest.py` only adds project root to `sys.path`, no fixtures.
- Test files use section comment banners with `──`.
- Caveman tests use temporary directories and custom test runners.
- Agent ownership is strictly enforced via PROMPT files and FORBIDDEN ZONES.

## ANTI-PATTERNS (THIS PROJECT)
- Forbidden-Zone Bugs (Kilo Code territory — DO NOT FIX) logged in OPENCODE_LOG.md
- NEVER TOUCH rules between agents in *_PROMPT.md files (core/, config/, utils/ vs scheduler/, automations/, tasks/, monitor/)
- NEVER modify/compress certain file types (.py, .js, .ts, .json, .yaml, .yml, .toml, .env, .lock, .css, .html, .xml, .sql, .sh) in caveman-compress
- NEVER redefine interface implementations from core/ in Kilo/Laguna agents
- DO NOT edit requirements.txt directly; log dependency requests via KILO_LOG.md
- No TODO/FIXME/HACK/XXX/TEMP markers allowed (CI enforcement via scripts/ci/checker-engine.js)
- Never mix bug fixes and features in the same commit
- Never use `git add -A` mid-session
- STATUS_BOARD.md is FROZEN — never modify this file under any circumstances

## UNIQUE STYLES
- Section comment banners with `──` in test files.
- Use of `setup_method()` alongside pytest class-style tests.
- Inline mock classes (callable) in test files.
- Caveman's custom JavaScript test runner (no Jest/Mocha).
- Caveman's use of `node:test` for installer tests.
- Caveman's verification script (`verify_repo.py`) that orchestrates checks.
- Agent-specific PROMPT files that define ownership and forbidden zones.
- The caveman skill itself embedded as a vendor directory.

## COMMANDS
```bash
# Discover connected devices
python phone_farm_cli.py discover

# Run health check on a device
python phone_farm_cli.py health <device_id>

# Execute a task on a device
python phone_farm_cli.py run <device_id> <task_name> [--param key=value]

# View task status
python phone_farm_cli.py status <job_id>

# Start the Electron GUI
launch.bat
# or
npm start

# Run the REST API monitor
uvicorn monitor.api:app --reload

# Run all tests
python -m pytest tests/

# Run caveman tests
python caveman/tests/test_compress_safety.py
node caveman/tests/test_caveman_stats.js

# Build Docker image
docker build -t phone-farm .

# Install caveman skill (for the caveman sub-project)
caveman/install.sh
# or
caveman/install.ps1
```

## NOTES
- The project consists of two main parts: the Python backend (device automation) and the Electron frontend (GUI). They are loosely coupled.
- The `caveman/` directory is a vendored copy of the caveman skill and has its own AGENTS.md, package.json, etc.
- Agent territories are strictly enforced: OpenCode must not touch Kilo/Laguna files (scheduler/, automations/, tasks/, monitor/) and vice versa.
- The virtual environment `ajan-ortam/` is committed to the repo but should be ignored by git (it is, via .gitignore? Actually we saw it's not ignored but exists on disk). It's not tracked but takes up space.
- The `dist/` directory contains build artifacts and is gitignored.
- The `requirements.txt` file pins dependencies but lacks hashes.
- The `launch.bat` file is Windows-specific; there's no equivalent for Linux/macOS.
- The `phone_farm_cli.py` is the entry point for the Python backend; it's not installed as a package.
- The `monitor/api.py` provides a REST API on port 8000 by default.
- The `caveman` skill can be used independently; its tests are in `caveman/tests/`.
- The project uses strict typing via MyPy; all Python functions must have type annotations.
- Line length is set to 88 to match Black formatter.
- The `conftest.py` only manipulates `sys.path` to allow imports from the project root.
- Test files use a consistent structure with section headers separated by `──` lines.
- The caveman tests use temporary directories for isolation and clean up after themselves.
- The agent coordination is documented in `AGENTS.md` and the various `*_PROMPT.md` files.
- The `empty_dir/`, `analytics/`, `cloud/`, `k8s/` directories are placeholders and currently empty.
- The `docker/Dockerfile` has known issues: `scrcpy` is not a valid apt package and `curl` is missing for the HEALTHCHECK.