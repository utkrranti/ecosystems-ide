# Altus IDE — Installers (all platforms)

**Last updated:** 2026-06-02

---

## Formats by platform

| Platform | Installer / package | What users run |
|----------|---------------------|----------------|
| **Windows** | `.exe` (Inno Setup), `.msi` (WiX) | Double-click setup |
| **macOS** | `.dmg`, `.zip` (contains `.app`) | Open DMG, drag to Applications |
| **Linux** | `.tar.gz` (portable), `.deb`, `.rpm` | See below |

Linux does **not** use a single `.sh` installer. The `code.sh` / `altus-ide` script in `bin/` is the **app launcher** after install. Distribution uses:

- **`.tar.gz`** — extract anywhere, run `bin/altus-ide`
- **`.deb`** — Ubuntu/Debian: `sudo dpkg -i AltusIDE-*.deb`
- **`.rpm`** — Fedora/RHEL: `sudo rpm -i AltusIDE-*.rpm`

---

## Can you build everything from a Windows PC?

| Target | On Windows natively | From Windows via WSL2 | Needs Mac / Linux CI |
|--------|-------------------|----------------------|----------------------|
| Windows `.exe` / `.msi` | ✅ Yes | — | — |
| Linux `.tar.gz` | ❌ | ✅ `build-installers-wsl.ps1` | ✅ GitHub Actions |
| Linux `.deb` | ❌ | ⚠️ Possible in WSL (heavy deps) | ✅ Recommended |
| macOS `.dmg` / `.zip` | ❌ | ❌ | ✅ Mac or `release-installers.yml` |

**macOS apps cannot be built on Windows** — Apple requires a Mac for `.app` / `.dmg` (codesigning/notarization also needs macOS).

**Recommended for all three OS families from one Windows machine:** push to GitHub and run **Release installers** workflow, then download artifacts.

---

## Windows (local)

```powershell
cd D:\Projects\EcoSystems\IDE
.\scripts\build-installers.ps1
```

Output: `dist\win32-x64\AltusIDESetup-*.exe`, `AltusIDEUserSetup-*.exe`, `AltusIDE-*.msi`

---

## Linux (WSL2 on Windows)

```powershell
.\scripts\build-installers-wsl.ps1              # .tar.gz
.\scripts\build-installers-wsl.ps1 -Deb           # .tar.gz + .deb
```

Or on Ubuntu/WSL directly:

```bash
./scripts/build-installers-linux.sh x64
./scripts/build-installers-linux.sh x64 --deb
```

---

## macOS (Mac only)

```bash
./scripts/build-installers-mac.sh arm64   # Apple Silicon
./scripts/build-installers-mac.sh x64     # Intel
```

Output: `dist/darwin-{arch}/AltusIDE-darwin-*.dmg` and `.zip`

---

## All platforms (GitHub Actions)

1. Push code to GitHub
2. **Actions** → **Release installers** → **Run workflow**
3. Download artifacts: `altus-ide-windows`, `altus-ide-macos-arm64`, `altus-ide-linux-x64`

```bash
gh workflow run release-installers.yml
gh run list --workflow=release-installers.yml
```

---

## Related

- [build.md](./build.md) — compile and Windows packaging overview
- [setup.md](./setup.md) — dev prerequisites
