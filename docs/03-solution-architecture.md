# Solution Architecture

System design for EcoSystems IDE: how components connect, how AI fits in, and how the repository is organized.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop Client (Electron)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Workbench UI│  │ Monaco Editor│  │ AI Panels + Inline UI   │ │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│  ┌──────┴────────────────┴──────────────────────┴─────────────┐ │
│  │              Extension Host (VS Code API)                   │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                    Core Services (TypeScript)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ File Sys │ │   Git    │ │   LSP    │ │ Workspace Index  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       └────────────┴────────────┴─────────────────┘           │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │ Context Assembly  │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │ Agent Orchestrator│                        │
│                    └─────────┬─────────┘                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────┐
│                         AI Layer                                 │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Model Router │→ │ Local LLM   │  │ Cloud APIs              │ │
│  │              │  │ (Ollama)    │  │ (OpenAI, Anthropic, …)  │ │
│  └──────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Tool Runtime: read / write / search / terminal / tests       ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Foundation Decision: Code-OSS Fork

**Recommended approach:** Fork [Code-OSS](https://github.com/microsoft/vscode) (MIT) and inject AI as first-party services.

| Approach | Pros | Cons |
|----------|------|------|
| **Code-OSS fork** ✓ | Fastest parity, extension ecosystem | Upstream merge burden |
| Eclipse Theia | Product-oriented, customizable | Smaller community |
| Greenfield Tauri + Monaco | Lightweight, full control | Years to reach VS Code parity |
| Zed-style native | Performance | No extension ecosystem day one |

**Strategy:** Fork for MVP → customize AI, sync, auth, and branding over time.

---

## AI Platform Architecture

AI is a **platform layer** with four subsystems.

### 1. Context Pipeline

```
User intent
  → Intent classifier (chat vs inline vs agent)
  → Context budget allocator (token limits)
  → Source gathering:
      - open files, selection, symbols (LSP)
      - git diff, diagnostics, test output
      - ripgrep + optional vector retrieval
  → Prompt assembly + project rules/skills
  → Model call (stream)
  → Post-process: citations, diffs, tool calls
  → UI: stream + apply/reject
```

**Context source priority**

1. User selection + active file
2. Related symbols (LSP references)
3. Git diff / recent changes
4. Diagnostics + test failures
5. Semantic retrieval (embeddings)
6. Extension-provided context (optional API)

### 2. Model Router

- Single internal interface for completion and chat providers
- Backends: OpenAI-compatible, Anthropic, Ollama, enterprise gateway
- Policies: per-workspace model, max tokens, PII redaction, “no cloud” mode

### 3. Agent Runtime

| Component | Responsibility |
|-----------|----------------|
| Planner | Decompose task into steps |
| Tool registry | `read_file`, `write_file`, `search`, `run_terminal`, `run_tests` |
| Sandbox | Path allowlist, command allowlist, user approval for destructive ops |
| Checkpoint | Snapshot before agent run; rollback on cancel |
| Audit log | Record what AI read/wrote/ran |

### 4. Trust Layer

- Diff-first apply (default)
- Secret scanner before outbound prompts
- Opt-in telemetry
- Context citations in UI

---

## Data Flow: Inline Completion

```
Keystroke / idle trigger
  → Debounce
  → Gather: active file slice, cursor context, recent edits
  → Model router → stream tokens
  → Monaco inline completion provider
  → User Tab accept or Esc dismiss
```

## Data Flow: Agent Task

```
User prompt in Composer
  → Context assembly (workspace scope)
  → Agent planner
  → Loop: tool call → result → next step
  → Proposed edits as diff hunks
  → User review (accept/reject per hunk)
  → Apply to filesystem + git staging optional
```

---

## Repository Structure (Target)

```
ecosystems-ide/
├── docs/                        # This documentation
├── scripts/                     # Build, fork sync, release
├── src/
│   vs/                          # Code-OSS core (upstream — minimize direct edits)
│   │   platform/ecosystems/     # ★ EcoSystems AI platform services
│   │   │   ai/
│   │   │   │   ├── context/
│   │   │   │   ├── router/
│   │   │   │   ├── inline/
│   │   │   │   └── secrets/
│   │   │   └── browser/         # Chat webview
│   │   workbench/contrib/ecosystems/  # ★ Workbench registration
│   extensions/
│   │   └── ecosystems-*/        # First-party extensions
├── test/
│   ├── unit/ecosystems/
│   ├── e2e/ecosystems/
│   └── ai-eval/
├── product.json
└── README.md
```

---

## Service Boundaries

| Service | Owns | Does not own |
|---------|------|--------------|
| **Workbench** | Layout, themes, commands, keybindings | Model calls |
| **LSP client** | Language servers, diagnostics routing | AI prompt building |
| **Context service** | Token budget, source ranking, caching | UI rendering |
| **Model router** | Provider selection, streaming, retries | File writes |
| **Agent service** | Tools, checkpoints, audit | Editor widget rendering |
| **Extension host** | Third-party extensions | Core AI secrets |

---

## Security Model (Summary)

| Concern | Mitigation |
|---------|------------|
| API keys | OS keychain (`keytar`); never in settings JSON |
| Secrets in prompts | Pre-flight scanner for `.env`, keys, tokens |
| Agent file writes | Workspace allowlist; diff review; undo checkpoint |
| Agent terminal | User approval for destructive commands |
| Network | “Offline / local only” mode disables cloud providers |
| Telemetry | Opt-in; no prompt content in default telemetry |

---

## Extension Compatibility Strategy

**Phase 0–1:** Curated internal extensions only  
**Phase 2:** VS Code API subset — themes, formatters, linters  
**Phase 3:** Broader marketplace compatibility with compatibility testing matrix

Document breaking differences in a dedicated compatibility guide before opening to third-party extensions.

---

## Upstream Sync Strategy

- Track Code-OSS release tags (e.g. monthly merge from `microsoft/vscode`)
- Maintain `docs/upstream-sync.md` with merge procedure and conflict hotspots
- Isolate EcoSystems changes under `src/vs/platform/ecosystems/` and `src/vs/workbench/contrib/ecosystems/` plus branded assets to reduce merge pain
