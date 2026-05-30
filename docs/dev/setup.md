# Development Environment Setup

How to clone, build, and run **EcoSystems IDE** from source on a developer machine.

**Base:** Code-OSS fork (see [upstream-sync.md](../architecture/upstream-sync.md))  
**Primary platform:** Windows 10/11  
**Last updated:** 2026-05-30

---

## 1. Prerequisites

### All platforms

| Tool | Version | Verify |
|------|---------|--------|
| Node.js | 20.x LTS | `node --version` |
| Git | 2.40+ | `git --version` |
| Python | 3.11+ | `python --version` |
| Yarn | 1.22+ | `yarn --version` |

Enable Corepack if needed:

```powershell
corepack enable
```

### Windows

| Tool | Notes |
|------|-------|
| **Visual Studio 2022** | Workload: *Desktop development with C++* |
| **Windows 10/11 SDK** | Included with VS installer |
| **PowerShell** | 5.1+ (default on Win 10/11) |

Optional: [Developer Mode](https://learn.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) enabled (symlink support for `yarn watch`).

### macOS

```bash
xcode-select --install
```

### Linux (Ubuntu 22.04+)

```bash
sudo apt update
sudo apt install -y build-essential libkrb5-dev libsecret-1-dev \
  libx11-dev libxkbfile-dev libnotify-dev libnss3-dev
```

For **keytar** (API key storage): GNOME Keyring or KWallet must be running.

---

## 2. Clone Repository

```powershell
git clone https://github.com/ecosystems/ide.git
cd ide
git checkout develop
```

**First-time fork setup** (maintainers only): follow [upstream-sync.md](../architecture/upstream-sync.md) §1.

---

## 3. Install Dependencies

```powershell
yarn
```

First install downloads Electron, native modules (`node-pty`, `keytar`, `@vscode/ripgrep`), and may take **10–20 minutes**.

### Common install failures

| Error | Fix |
|-------|-----|
| `node-gyp` / MSBuild not found | Install VS 2022 C++ workload; run from *Developer PowerShell* |
| `EPERM` on Windows | Close other Node processes; run terminal as admin once |
| `keytar` build fail (Linux) | Install `libsecret-1-dev` |
| Out of memory | Close apps; `set NODE_OPTIONS=--max-old-space-size=8192` |

---

## 4. First Build

```powershell
yarn compile
```

Or for active development (incremental rebuild):

```powershell
yarn watch
```

**Expected first compile time:** 15–30 minutes (depends on hardware).

Output directory: `out/` (VS Code convention).

---

## 5. Launch Dev Instance

### VS Code / Cursor (recommended)

1. Open repo root in Cursor or VS Code
2. **Run and Debug** → select **Launch EcoSystems IDE**
3. A new window opens with `[Extension Development Host]` or product name **EcoSystems IDE**

If launch config is missing, add `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch EcoSystems IDE",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/scripts/code.bat",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/scripts/code.bat"
      },
      "osx": {
        "runtimeExecutable": "${workspaceFolder}/scripts/code.sh"
      },
      "linux": {
        "runtimeExecutable": "${workspaceFolder}/scripts/code.sh"
      }
    }
  ]
}
```

*(Adjust script names after branding — inherited from Code-OSS as `scripts/code.bat`.)*

### Command line

```powershell
.\scripts\code.bat
```

Pass a folder to open:

```powershell
.\scripts\code.bat D:\Projects\my-app
```

---

## 6. Configure AI (Development)

1. Open **Settings** → **EcoSystems AI**
2. Enter OpenAI-compatible API key (stored in OS keychain)
3. Set chat model: `gpt-4o-mini` (default)
4. Toggle **Enable AI**

**Never commit API keys.** Use personal dev keys only.

Verify keychain on Windows: Credential Manager → Windows Credentials → look for `ecosystems-ide`.

---

## 7. User Data (Dev vs Production)

Dev builds use a separate data directory to avoid conflicting with VS Code:

| | Path (Windows) |
|---|----------------|
| EcoSystems IDE dev | `%APPDATA%\ecosystems-ide-dev\User` |
| Production (after install) | `%APPDATA%\ecosystems-ide\User` |

Set via `--user-data-dir` in launch config if needed.

---

## 8. Recommended IDE Extensions (for contributing)

When editing the fork itself in Cursor/VS Code:

- ESLint
- TypeScript and JavaScript Language Features (built-in)

Do not install extensions that modify the fork's own `node_modules`.

---

## 9. Validation Checklist

After setup, confirm:

- [ ] `yarn compile` exits 0
- [ ] App launches with EcoSystems branding
- [ ] Explorer opens a folder
- [ ] Integrated terminal runs `echo hello`
- [ ] TypeScript LSP shows diagnostics in a `.ts` file
- [ ] Settings → EcoSystems AI section visible (after AI code lands)

Record validation date and engineer name in `docs/program/sign-off.md` item A15.

---

## 10. Troubleshooting

| Symptom | Action |
|---------|--------|
| White screen on launch | Check `out/` exists; re-run `yarn compile` |
| `yarn watch` CPU high | Normal during first compile; wait for "Finished compilation" |
| Port in use | Kill orphaned Electron: Task Manager → *EcoSystems IDE* |
| Wrong product name | Re-run branding script; check `product.json` |

See [build.md](./build.md) for compile targets and CI parity.

---

## 11. Related Documents

- [build.md](./build.md)
- [contributing.md](./contributing.md)
- [upstream-sync.md](../architecture/upstream-sync.md)
- [repo-layout.md](../architecture/repo-layout.md)
