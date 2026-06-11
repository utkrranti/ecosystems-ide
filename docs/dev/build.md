# Build & Compile Guide

Build targets, commands, and packaging for Altus IDE.

**Last updated:** 2026-05-30

---

## 1. Build Overview

Altus IDE inherits the **Code-OSS gulp + yarn** pipeline:

```
source (src/) → compile (out/) → bundle → electron → installer
```

| Stage | Output | Command |
|-------|--------|---------|
| Compile | `out/` | `yarn compile` |
| Watch | incremental `out/` | `yarn watch` |
| Unit tests | — | `yarn test` |
| Extensions | `extensions/*/out` | part of compile |
| Package (Win) | `.exe` setup | see §5 |

---

## 2. Daily Development Commands

```powershell
# One-shot compile
yarn compile

# Incremental (leave running in terminal)
yarn watch

# Compile + run tests
yarn compile && yarn test

# Lint (if configured)
yarn eslint
```

**Rule:** Keep one `yarn watch` terminal open while editing TypeScript under `src/`.

---

## 3. Compile Targets

Inherited from upstream; common gulp targets:

| Target | Purpose |
|--------|---------|
| `compile-client` | Main workbench + platform |
| `compile-extensions` | Built-in extensions |
| `watch-client` | Watch main sources |
| `watch-extensions` | Watch extensions |

Altus AI code lives under:

```
src/vs/platform/ecosystems/
src/vs/workbench/contrib/ecosystems/
```

These are included in `compile-client` once registered in the workbench contribution.

---

## 4. Project Structure vs Build

```
src/vs/                    → out/vs/           (compiled JS)
src/vs/platform/ecosystems/ → out/vs/platform/ecosystems/
extensions/                → extensions/*/out/
```

**Do not edit `out/` directly** — always edit `src/` and recompile.

---

## 5. Packaging (Windows)

### One command — EXE + MSI

```powershell
.\scripts\build-installers.ps1
```

| Output | Location |
|--------|----------|
| System EXE (per-machine) | `dist\win32-x64\AltusIDESetup-x64-{version}.exe` |
| User EXE (per-user) | `dist\win32-x64\AltusIDEUserSetup-x64-{version}.exe` |
| MSI (per-machine) | `dist\win32-x64\AltusIDE-x64-{version}.msi` |

**Prerequisites:** Node 20+, repo dependencies (`yarn`), ~16 GB RAM. **MSI** additionally requires [WiX Toolset v3.11+](https://wixtoolset.org/) (`winget install WiXToolset.WiXToolset`).

Options:

```powershell
.\scripts\build-installers.ps1 -ExeOnly          # Inno Setup only
.\scripts\build-installers.ps1 -MsiOnly          # MSI only (needs packaged app)
.\scripts\build-installers.ps1 -SkipPackage      # Reuse ../VSCode-win32-x64
```

First run packages the app (`gulp vscode-win32-x64-min`) — typically **15–40 minutes**.

Packaged app (uninstaller input) lives at `../VSCode-win32-x64/` relative to the IDE repo.

**macOS (.dmg), Linux (.deb / .tar.gz):** see [installers.md](./installers.md). Those cannot be built natively on Windows except Linux via WSL2 or GitHub Actions.

---

## 6. Build Configurations

| Config | Use |
|--------|------|
| **Dev** | `yarn watch` + launch script; source maps on |
| **CI** | `yarn compile` + `yarn test`; no watch |
| **Release** | Minified client + signed installer (Phase 1) |

Environment variables (inherited):

| Variable | Effect |
|----------|--------|
| `VSCODE_DEV=1` | Dev mode behaviors |
| `NODE_OPTIONS=--max-old-space-size=8192` | Avoid OOM on large compiles |

---

## 7. Native Modules

Rebuild if Node/Electron version changes:

```powershell
yarn electron-rebuild
```

Native deps used by EcoSystems:

| Module | Purpose |
|--------|---------|
| `keytar` | API key keychain |
| `node-pty` | Terminal |
| `@vscode/ripgrep` | Search |
| `@vscode/spdlog` | Logging (upstream) |

---

## 8. Branding Build Step

Before release builds, apply branding:

```powershell
./scripts/brand.ps1
```

Patches `product.json`, icons, and about dialog. See [upstream-sync.md](../architecture/upstream-sync.md).

---

## 9. Clean Build

When things go wrong:

```powershell
# Remove outputs
Remove-Item -Recurse -Force out, .build -ErrorAction SilentlyContinue

# Reinstall (last resort)
Remove-Item -Recurse -Force node_modules
yarn
yarn compile
```

---

## 10. CI Parity

Local verification before push (matches future CI):

```powershell
yarn compile
yarn test
# Optional: yarn playwright test (when e2e exists)
```

---

## 11. Build Performance Tips

| Tip | Benefit |
|-----|---------|
| SSD for repo | Faster compile |
| 16 GB+ RAM | Avoid Node OOM |
| Exclude `out/` from antivirus scan | Faster watch |
| Single `yarn watch` instance | Avoid file lock conflicts |

Target: incremental rebuild < 5s for single-file AI service change (after warm watch).

---

## 12. Related Documents

- [setup.md](./setup.md)
- [ci-cd.md](./ci-cd.md) *(planned)*
- [repo-layout.md](../architecture/repo-layout.md)
