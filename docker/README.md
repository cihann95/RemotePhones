# Phone Farm Backup — Docker Stack

Production-ready Docker Compose setup. One command brings up the entire API stack.

## Quick Start

```bash
# 1. From the PROJECT ROOT, copy the env template
cp docker/.env.example .env
$EDITOR .env                  # at minimum, set API_SECRET_KEY

# 2. Build and start the API
docker-compose -f docker/docker-compose.yml up -d

# 3. Verify it works
curl http://localhost:8000/health
# {"status":"ok","service":"phone-farm","python":"3.11.x ..."}

# 4. Tail the logs
docker-compose -f docker/docker-compose.yml logs -f api
```

When you're done:

```bash
docker-compose -f docker/docker-compose.yml down            # stop, keep volumes
docker-compose -f docker/docker-compose.yml down -v         # stop AND wipe volumes
```

## Prerequisites

| Tool         | Version          | Check                  |
| ------------ | ---------------- | ---------------------- |
| Docker       | 20.10+           | `docker --version`     |
| Docker Compose | v2 (plugin)    | `docker compose version` |
| Free RAM     | ~1 GB for the API service | —              |
| Free disk    | ~1.5 GB for the image + volumes | —     |

The legacy `docker-compose` (Python) CLI is also supported — `docker-compose --version` should report v1.29+.

## What Runs by Default

```text
phone-farm-net (bridge network)
├── phone-farm-api   image: phone-farm-api:latest  port: 8000 → 8000
└── (redis is OFF by default — opt in with --profile with-redis)
```

The `api` service:
- builds from `../Dockerfile` (the multi-stage `python:3.11-slim` image)
- exposes port 8000 (override host port with `API_PORT=…` in `.env`)
- reads environment from `../.env` (the project root)
- mounts `./logs` (named volume) and `./config` (read-only) and `./data` (SQLite JobQueue)
- restarts automatically unless you explicitly stop it (`restart: unless-stopped`)

## Optional: Enable Redis

Redis is profile-gated so it does not consume resources unless you actually need it.

```bash
docker-compose -f docker/docker-compose.yml --profile with-redis up -d
```

The `api` service uses the internal hostname `redis` automatically (see `REDIS_URL` in `.env`). The Redis data lives in the `phone-farm-redis` named volume, capped at 256 MB with an LRU eviction policy.

## USB / ADB Device Passthrough

ADB talks to Android phones over raw USB. The container needs access to the host's USB bus for `adb devices` to enumerate devices.

**Steps for every OS:**

1. Open `docker/docker-compose.yml`.
2. Find the commented `devices:` and `privileged:` block under the `api` service.
3. Uncomment only the lines appropriate for your host OS (see below).
4. `docker-compose -f docker/docker-compose.yml up -d` (the `--build` flag is only needed if you change the image itself, not for compose-only edits).

### Linux (Ubuntu, Fedora, Arch, …) — recommended

```yaml
devices:
  - /dev/bus/usb:/dev/bus/usb
privileged: true
```

Additional setup:

```bash
# Add yourself to the plugdev group so you can read/write USB devices
sudo usermod -aG plugdev $USER
# Either reboot, or:
newgrp plugdev

# OR, less secure but quick:
sudo chmod -R 666 /dev/bus/usb
```

Verify from inside the container:

```bash
docker exec -it phone-farm-api adb devices
# List of devices attached
# ABCD1234    device
```

### Windows (Docker Desktop with WSL2)

Docker Desktop on Windows uses WSL2 under the hood. Raw USB passthrough requires `usbipd-win`.

1. Install [usbipd-win](https://github.com/dorssel/usbipd-win/releases) (admin PowerShell):
   ```powershell
   winget install usbipd
   ```
2. List USB devices (admin):
   ```powershell
   usbipd wsl list
   # BUSID  VID:PID    DEVICE
   # 1-1    04e8:6860  Samsung Android
   ```
3. Attach the device to WSL (admin):
   ```powershell
   usbipd wsl attach --busid 1-1
   ```
4. In WSL, enable the same `devices:` + `privileged: true` block as Linux above.
5. `docker-compose -f docker/docker-compose.yml up -d`.

> **Note**: Re-attach the device every time you reboot Windows or unplug/replug the phone:
> `usbipd wsl attach --busid 1-1`.

### macOS (Docker Desktop)

macOS does not expose `/dev/bus/usb` to Docker containers reliably. The most common patterns are:

- **Run ADB on the host**, then expose the API externally and have the host's `adb` reach the container's `redis` (only useful if you need cache sharing). Phone control still happens from the macOS terminal.
- **Experimental**: enable `privileged: true` and the `devices:` mapping — some users report partial success, but it is **not officially supported** by Docker for Mac.

If you only need the API + Redis (no phone control), the default config works out of the box on macOS.

## Environment Variables

The compose file reads from `../.env` (project root). See `docker/.env.example` for the full template.

| Variable          | Required | Default                | Purpose                              |
| ----------------- | -------- | ---------------------- | ------------------------------------ |
| `API_SECRET_KEY`  | **Yes**  | —                      | Bearer token for API auth            |
| `PHONE_FARM_MODE` | No       | `home`                 | `home` (USB-direct) or `office` (Tailscale) |
| `API_PORT`        | No       | `8000`                 | Host port the API publishes on       |
| `REDIS_URL`       | No       | `redis://redis:6379/0` | Internal Redis URL (only with `--profile with-redis`) |
| `REDIS_PORT`      | No       | `6379`                 | Host port for Redis                  |
| `PYTHONUNBUFFERED`| No       | `1`                    | Stream logs immediately              |

## Production Deployment Notes

This compose file is **production-ready for a single host** (VPS, bare-metal, on-prem). For higher-scale deployments:

1. **Put a reverse proxy in front.** Run Caddy or Traefik on the host and terminate TLS there. The API binds to `0.0.0.0:8000` inside the container; expose only to localhost and let the proxy handle public traffic.
2. **Set a real `API_SECRET_KEY`.** Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. Rotate via `python phone_farm_cli.py rotate-key` (the running API picks up the new key on the next request after restart).
3. **Pin the image tag.** The compose file uses `phone-farm-api:latest`. For production, change it to a specific tag (`phone-farm-api:0.1.0`) and rebuild with that tag.
4. **Back up the named volumes.** `phone-farm-data` (SQLite JobQueue) and `phone-farm-redis` (if enabled) contain your state. Add them to your regular backup rotation.
5. **Log rotation.** The default Docker JSON log driver grows without bound. Add a `logging:` block to each service:
   ```yaml
   logging:
     driver: json-file
     options:
       max-size: "10m"
       max-file: "3"
   ```
6. **Resource limits.** The api service is capped at 1 GB RAM. Bump `deploy.resources.limits.memory` if you run heavy bulk-call jobs.
7. **Do not run as root on the host.** Add your user to the `docker` group instead of invoking `sudo docker …`.

## Troubleshooting

### `bind: address already in use` on port 8000

Another process is using port 8000. Either stop it, or change the host-side port:

```bash
echo "API_PORT=8123" >> .env
docker-compose -f docker/docker-compose.yml up -d
# now: curl http://localhost:8123/health
```

### Container keeps restarting, logs say `ModuleNotFoundError: No module named 'fastapi'`

The build context is wrong. Run from the **project root**, not from `docker/`:

```bash
# wrong (relative path resolves differently)
cd docker && docker-compose up -d

# right (../Dockerfile resolves correctly)
docker-compose -f docker/docker-compose.yml up -d
```

### Health check always reports `unhealthy`

```bash
docker inspect --format '{{json .State.Health}}' phone-farm-api
```

- `start_period: 20s` — the first 20 seconds are normal. Wait it out for a cold build.
- If the container exits before the healthcheck, the `inspect` output will show `Status: dead` — check `docker logs phone-farm-api`.
- If curl inside the image is missing, the healthcheck falls back to `python -c "import urllib.request ..."` which is part of the Python stdlib.

### `adb devices` returns empty inside the container

USB passthrough is not enabled. See the [USB / ADB Device Passthrough](#usb--adb-device-passthrough) section above.

### `permission denied` reading `/dev/bus/usb/*` on Linux

Add yourself to the `plugdev` group and reboot, or run `sudo chmod -R 666 /dev/bus/usb` (less safe, but quick):

```bash
sudo usermod -aG plugdev $USER
# log out and back in
```

### `.env` file is not being picked up

The compose file uses `env_file: - ../.env` — meaning the file must be in the **project root** (one level above `docker/`), not inside `docker/`.

```bash
ls -la .env           # project root
ls -la docker/.env    # WRONG — ignored by compose
```

### Forgot to generate a real `API_SECRET_KEY`

The API will start, but every authenticated request will fail with `401 Unauthorized`. Either:

```bash
python phone_farm_cli.py rotate-key
# or
python -c "import secrets; print(secrets.token_hex(32))"
```

…then paste the new value into `.env` and restart:

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### Want to wipe state and start fresh

```bash
docker-compose -f docker/docker-compose.yml down -v
docker volume rm phone-farm-logs phone-farm-data phone-farm-redis
docker-compose -f docker/docker-compose.yml up -d
```

## Files in This Directory

```text
docker/
├── Dockerfile            # multi-stage build (python:3.11-slim)
├── docker-compose.yml    # api + optional redis services
├── .env.example          # env template (copy to ../.env)
└── README.md             # you are here
```
