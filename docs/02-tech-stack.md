# Tech Stack

Complete technology choices for EcoSystems IDE — a VS Code–class desktop editor with built-in AI.

---

## Stack at a Glance

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron |
| Editor core | Monaco Editor (via Code-OSS) |
| Workbench / UI | TypeScript + VS Code workbench (inherited) |
| Extension system | VS Code Extension Host API |
| Language intelligence | LSP (Language Server Protocol) |
| AI orchestration | TypeScript (Node.js in main / extension host) |
| Local search / index | Ripgrep, Tree-sitter, SQLite |
| Optional semantic search | sqlite-vec or LanceDB |
| Local AI runtime | Ollama |
| Cloud AI | OpenAI-compatible APIs |
| Git | libgit2 / VS Code built-in Git |
| Terminal | xterm.js + node-pty |
| Debug | Debug Adapter Protocol (DAP) |
| Build | gulp + esbuild (VS Code toolchain) |
| Packaging | electron-builder |
| CI/CD | GitHub Actions |
| Testing | Mocha, Playwright (e2e) |
| Crash tracking (optional) | Sentry |
| Auto-update | electron-updater |

---

## Layer-by-Layer Breakdown

### A. Foundation — Desktop App

**Electron**

- Cross-platform desktop app (Windows, macOS, Linux)
- Same model as VS Code, Cursor, Windsurf
- Window management, menus, filesystem access, native dialogs, auto-update

**Why Electron for v1 (not Tauri / Flutter / native-only)?**

- Fastest path to VS Code parity and extension compatibility
- Tauri is lighter but requires rebuilding years of workbench behavior
- Flutter is strong for apps, not for a full IDE ecosystem on day one

---

### B. Editor & Workbench

| Technology | Role |
|------------|------|
| **Code-OSS fork** | Full workbench: sidebar, tabs, panels, settings, keybindings |
| **TypeScript** | Primary language for the client (matches VS Code upstream) |
| **Monaco Editor** | Syntax highlighting, multi-cursor, minimap, diff editor, inline AI |

---

### C. Language & Tooling

| Technology | Role |
|------------|------|
| **LSP** | Autocomplete, go-to-definition, diagnostics, rename, hover |
| **DAP** | Run and debug with breakpoints, variables, call stack |
| **Tree-sitter** | Syntax trees for symbol extraction and scope-aware search |
| **Ripgrep** | Fast workspace text search |
| **SQLite** | Local index, symbol cache, file metadata, session metadata |
| **sqlite-vec / LanceDB** (optional) | Vector embeddings for semantic “find related code” |

---

### D. AI Platform

Built as **core TypeScript services**, not a single bolt-on extension.

| Component | Technology |
|-----------|------------|
| Model router | Internal TS abstraction; swappable backends |
| Streaming | SSE / fetch streams from LLM APIs |
| Context builder | LSP symbols + ripgrep + git + open files + diagnostics |
| Prompt engine | Templates + project rules from `.ide/rules` |
| Agent runtime | Tool registry: read/write, search, terminal (with approval) |
| Inline completion | Monaco inline completions API |
| Chat / Composer UI | VS Code webviews (HTML/CSS/JS or React) |

**LLM backends**

| Backend | Use case |
|---------|----------|
| OpenAI API | GPT models |
| Anthropic API | Claude models |
| Azure OpenAI / AWS Bedrock | Enterprise |
| Ollama | Local models offline |
| OpenAI-compatible endpoints | Self-hosted vLLM, LiteLLM gateway |

**Embeddings (optional)**

- Cloud: e.g. `text-embedding-3-small`
- Local: via Ollama
- Storage: SQLite or LanceDB on disk

---

### E. Terminal & Shell

| Technology | Role |
|------------|------|
| **xterm.js** | Terminal UI in bottom panel |
| **node-pty** | Real shell processes (PowerShell, bash, zsh) |

AI consumes terminal output as context for build/test failure flows.

---

### F. Git & Source Control

Built-in VS Code Git (libgit2):

- Diff, stage, commit, branch, merge conflict UI
- AI `@git` context: staged changes, recent commits

---

### G. Extensions

| Technology | Role |
|------------|------|
| **VS Code Extension Host** | Run existing extensions (themes, linters, formatters) |
| **First-party extensions** | EcoSystems-specific integrations |

Launch with a **curated allowlist**; expand marketplace compatibility deliberately.

---

### H. Configuration & Secrets

| Item | Mechanism |
|------|-----------|
| User settings | VS Code `settings.json` pattern |
| Workspace settings | `.vscode/` or `.ide/` |
| API keys | OS keychain via `keytar` |
| AI rules / skills | `.ide/rules`, `.ide/skills/` |

---

### I. Build, Release & DevOps

| Tool | Purpose |
|------|---------|
| Node.js 20+ | Build scripts and extension host |
| yarn or npm | Package management |
| gulp + esbuild | VS Code build pipeline |
| electron-builder | Installers (.exe, .dmg, .AppImage) |
| electron-updater | Auto-update |
| GitHub Actions | CI: build, test, sign, publish |
| Code signing | Windows Authenticode, macOS notarization |

---

### J. Testing & Quality

| Tool | Purpose |
|------|---------|
| Mocha + assert | Unit tests |
| Playwright | End-to-end UI tests |
| AI eval harness | Golden repos + fixed prompts |
| ESLint + Prettier | Code style |
| TypeScript strict | Type safety |

---

### K. Observability (Optional)

| Tool | Purpose |
|------|---------|
| Sentry | Crash and error tracking |
| PostHog / Amplitude | Product analytics (opt-in) |
| Structured logging | pino or VS Code log service |

---

## Languages Used

| Language | Where |
|----------|--------|
| TypeScript | ~95% — main process, workbench, AI services, extensions |
| HTML / CSS | Webviews (chat, settings) |
| JavaScript | Webview UI (or React) |
| Rust / C++ | Upstream VS Code native modules only (ripgrep, node-pty) |
| Shell / PowerShell | Build scripts, CI |

**Not recommended for core IDE:** Dart/Flutter (consider later for companion mobile app only).

---

## Inherited vs Built

| Inherited from Code-OSS (~80%) | Built by EcoSystems (~20%) |
|--------------------------------|----------------------------|
| Electron shell | Context engine |
| Monaco editor | Model router |
| Workbench UI | Agent + tools |
| LSP client | Inline completion |
| Git UI | Chat / Composer UI |
| Terminal | Rules and skills |
| Debugger | Privacy modes, keychain integration |
| Extension host | Branding, update channel |

---

## Phase 0 Core Dependencies

Expected when scaffolding the repository:

```
electron
typescript
monaco-editor          (via vscode fork)
node-pty
xterm
keytar
openai                 (or generic OpenAI-compatible client)
ollama                 (local model client)
better-sqlite3
@vscode/ripgrep
tree-sitter + language grammars
electron-builder
electron-updater
playwright               (dev)
```

---

## One-Line Summary

**Electron + TypeScript + Code-OSS fork** for the shell; **Monaco + LSP + DAP + xterm** for developer tooling; **TypeScript AI services + Ollama/cloud LLMs + SQLite/ripgrep/tree-sitter** for intelligence; **electron-builder + GitHub Actions** to ship.
