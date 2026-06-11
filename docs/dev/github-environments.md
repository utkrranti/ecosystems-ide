# GitHub Environments — Altus IDE

Create environments in the **ecosystems-ide** repo:

| Environment | Purpose |
|-------------|---------|
| `production` | Publish installers + auto-update feed to VPS |
| `staging` | Test publish pipeline before production |

Local builds use your machine only — no GitHub Environment required.

## production — Variables

| Variable | Example |
|----------|---------|
| `UPDATES_BASE_URL` | `https://updates.altuside.com` |
| `UPDATE_QUALITY` | `stable` |
| `UPDATE_PLATFORMS` | `win32-x64-user,win32-arm64-user` |

## Workflows

| Workflow | What it does |
|----------|----------------|
| **Release installers** | Build artifacts only (Windows / macOS / Linux) |
| **Publish IDE update** | Build on `windows-latest` → publish on `[self-hosted, altus-vps]` (no SSH from cloud runners) |

Requires the **utkrranti** org self-hosted runner (`altus-vps`). See `ide_apis/deploy/github-environments.md`.

Run **Publish IDE update** manually: **Actions → Publish IDE update → Run workflow** → pick `production` or `staging`.

## UPDATE_* lifecycle

CI computes these on each publish (no manual editing):

| Field | Source |
|-------|--------|
| `UPDATE_LATEST_VERSION` | `package.json` version |
| `UPDATE_LATEST_COMMIT` | `git rev-parse HEAD` at build |
| `UPDATE_INSTALLER_URL` | `{UPDATES_BASE_URL}/releases/AltusIDEUserSetup-{arch}-{version}.exe` |
| `UPDATE_INSTALLER_SHA256` | `sha256sum` of uploaded installer |

The gateway (`ide_apis`) serves them at `GET /api/update/{platform}/{quality}/{commit}`.

## staging vs production

Use separate GitHub Environments with different `UPDATES_BASE_URL` / VPS targets if you add a staging host. Secret **names** stay the same; only values differ.
