# EcoSystems IDE

A VS Code–class desktop editor with **native AI** — built on Code-OSS 1.96.2.

| | |
|---|---|
| **Docs** | [docs/README.md](./docs/README.md) · [Reading sequence](./docs/READING-SEQUENCE.md) |
| **Repo** | https://github.com/utkrranti/ecosystems-ide |
| **Upstream** | [microsoft/vscode](https://github.com/microsoft/vscode) @ 1.96.2 |

## Quick start (developers)

```powershell
corepack enable
yarn
yarn compile
.\scripts\code.bat
```

See [docs/dev/setup.md](./docs/dev/setup.md) for full prerequisites (Node 20, Python, VS Build Tools on Windows).

## EcoSystems code

| Path | Purpose |
|------|---------|
| `src/vs/platform/ecosystems/` | AI platform services |
| `src/vs/workbench/contrib/ecosystems/` | Workbench UI (AI sidebar) |

## License

MIT — inherited from Code-OSS. See [docs/legal/oss-attribution.md](./docs/legal/oss-attribution.md).

EcoSystems IDE is **not** Microsoft Visual Studio Code and is not affiliated with Microsoft.
