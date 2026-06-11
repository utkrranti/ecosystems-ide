# PRD v1 — Phase 0 (Foundation)

**Product:** Altus IDE  
**Version:** 1.0  
**Phase:** 0 — Foundation  
**Status:** Draft for sign-off  
**Last updated:** 2026-05-30  

---

## 1. Summary

Phase 0 delivers a **branded Code-OSS fork** with **two AI surfaces**: inline completion and a basic chat sidebar. A developer can install the app, add an API key, open a project, and use AI on the **active file** without leaving the editor.

This PRD **freezes scope** for the first implementation sprint cycle. Anything not listed in §5 is out of scope for Phase 0.

---

## 2. Problem Statement

Developers want VS Code’s reliability with AI integrated into the editing flow — not a separate browser tab or extension that only sees one file. Today, greenfield teams either use VS Code + disconnected AI extensions or AI-first editors that sacrifice extension/debug parity.

**Phase 0 proves:** we can ship a daily-usable fork with native AI on a predictable timeline.

---

## 3. Goals

| # | Goal | Measurable outcome |
|---|------|-------------------|
| G1 | Ship installable desktop app | `.exe` on Windows; dev build on macOS/Linux |
| G2 | Inline AI in editor | Ghost text appears within 2s on typical prompt |
| G3 | Chat on active file | User asks question; answer streams in sidebar |
| G4 | Secure API key storage | Keys in OS keychain, not plain settings |
| G5 | No core regressions | Explorer, terminal, LSP unchanged vs upstream |
| G6 | Repeatable build | CI produces artifact on every `main` push |

---

## 4. Target User (Phase 0)

**Primary:** Professional developer (Persona 1 from [01-product-vision.md](../01-product-vision.md))

- Uses TypeScript/JavaScript or Python daily
- Has own API key (OpenAI or compatible)
- Works on single-repo projects (< 5k files)
- Windows primary; macOS/Linux supported in dev builds

**Not targeting in Phase 0:** Teams, enterprise admin, air-gapped/Ollama-only users (Phase 2).

---

## 5. In Scope (Phase 0 Features)

### 5.1 Platform & branding

| ID | Feature | Acceptance criteria |
|----|---------|---------------------|
| F-001 | Code-OSS fork | Repo contains fork; builds locally per `docs/dev/setup.md` |
| F-002 | Product identity | App name **Altus IDE**; custom icon; about dialog updated |
| F-003 | Version scheme | Semver `0.1.x` for Phase 0 releases |

### 5.2 Settings & secrets

| ID | Feature | Acceptance criteria |
|----|---------|---------------------|
| F-010 | API key settings UI | Settings page: provider, API key field, model dropdown |
| F-011 | Keychain storage | Key stored via OS keychain; never written to `settings.json` |
| F-012 | Model picker | User selects one chat model and one completion model |
| F-013 | Enable/disable AI | Toggle turns off inline + chat (no network calls) |

### 5.3 Inline completion

| ID | Feature | Acceptance criteria |
|----|---------|---------------------|
| F-020 | Ghost text | Suggestions appear after debounce while typing |
| F-021 | Accept / dismiss | `Tab` accepts; `Esc` dismisses; typing continues uninterrupted |
| F-022 | Active file context | Sends cursor neighborhood + language ID + file path (relative) |
| F-023 | Status indicator | Status bar shows completion on/off and model name |

### 5.4 Chat sidebar

| ID | Feature | Acceptance criteria |
|----|---------|---------------------|
| F-030 | AI activity bar entry | New sidebar view with chat icon |
| F-031 | Message thread UI | User messages + streamed assistant responses |
| F-032 | `@currentFile` | Attach active editor buffer (or selection if non-empty) |
| F-033 | Insert code action | Copy assistant code block to clipboard or insert at cursor |
| F-034 | Cancel stream | Stop button aborts in-flight request |
| F-035 | Empty/error states | Clear UI when no API key or request fails |

### 5.5 Build & CI

| ID | Feature | Acceptance criteria |
|----|---------|---------------------|
| F-040 | Dev workflow | `yarn watch` + launch debug config documented |
| F-041 | CI pipeline | GitHub Actions: compile + unit smoke on PR |
| F-042 | Windows package | CI or manual script produces installable Windows build |

---

## 6. Out of Scope (Phase 0)

See [non-goals.md](./non-goals.md) for the full register. Summary:

- Agent / multi-file composer
- `@workspace`, `@git`, `@folder`, `@terminal`
- Diff review / AI file writes
- Ollama / local models
- Vector / semantic search
- Extension marketplace
- Project rules (`.ide/rules`)
- Secret scanner (Phase 1)
- Telemetry (beyond crash logs if enabled by Electron default)
- Code signing / auto-update (documented for Phase 0 exit, not required day one)
- macOS/Linux signed installers

---

## 7. User Stories

### Inline completion

> As a developer, when I type in a source file, I see AI suggestions inline so I can accept useful completions without opening chat.

**Acceptance:** Tab accepts; latency p95 < 3s on 100-line file with cloud model.

### Chat on current file

> As a developer, I select code, open AI chat, and ask “what does this do?” so I understand unfamiliar code in context.

**Acceptance:** Response references the attached file; streams within 1s of first token.

### First-time setup

> As a new user, I enter my API key once and it persists securely so I don’t re-enter it each session.

**Acceptance:** Key survives app restart; not visible in settings export.

---

## 8. UX Requirements (Phase 0 minimum)

| Area | Requirement |
|------|-------------|
| Layout | AI chat in sidebar; do not replace Explorer default |
| Keyboard | Preserve all VS Code defaults; add `Ctrl+Shift+I` to focus chat (configurable) |
| Loading | Streaming cursor in chat; subtle inline loading for completions |
| Errors | Toast + inline message for 401, 429, network offline |
| Privacy | Settings label: “Code is sent to [provider] when AI is enabled” |

Detailed UX specs: `docs/design/` (Phase 0 wireframes — separate docs).

---

## 9. Technical Constraints

- Base: Code-OSS fork (ADR-001)
- AI: core services under `src/vs/platform/ecosystems/ai/` (see [repo-layout.md](../architecture/repo-layout.md))
- Default provider: OpenAI-compatible API (ADR-009)
- Chat webview: vanilla TS + CSS (ADR-008)
- Min OS: Windows 10+, macOS 12+, Ubuntu 22.04+

---

## 10. Dependencies

| Dependency | Owner | Needed by |
|------------|-------|-----------|
| Fork spike complete | Engineering | Week 1 |
| `setup.md` validated | Engineering | Week 1 |
| Model router interface | Architecture | Week 2 |
| OpenAI API key for dev | Team | Week 1 |
| Icon assets | Design | Week 2 |

---

## 11. Success Metrics (Phase 0)

| Metric | Target |
|--------|--------|
| Time to first completion | < 2 min after install (with key) |
| Inline acceptance rate | > 15% (baseline measurement) |
| Chat sessions per DAU | > 1 (baseline) |
| P0 bug count at exit | 0 open |
| Core smoke tests | 100% pass |

---

## 12. Milestones

| Week | Milestone |
|------|-----------|
| 1 | Fork builds; branding applied; empty AI sidebar |
| 2 | Model router + keychain; chat streams |
| 3 | Inline completion provider wired |
| 4 | Polish, error states, CI green |
| 5–6 | Buffer: packaging, docs, sign-off |

---

## 13. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fork build fails on Windows | Blocks all | Week 1 -1 spike |
| API latency poor | Bad UX | Debounce, cancel, cache prefix |
| Upstream merge conflicts | Slows future | Isolate AI under dedicated paths |
| Scope creep (agent) | Delays ship | This PRD is the scope contract |

---

## 14. Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Product | | | ☐ |
| Engineering | | | ☐ |
| Security | | | ☐ |

See [sign-off.md](../program/sign-off.md) for full checklist.
