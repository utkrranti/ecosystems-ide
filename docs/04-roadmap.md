# Product Roadmap

Phased delivery plan from greenfield to a daily-driver AI IDE.

---

## Overview

| Phase | Name | Duration (est.) | Outcome |
|-------|------|-----------------|---------|
| **0** | Foundation | 4–6 weeks | Branded fork, inline AI, basic chat |
| **1** | Context & trust | 6–8 weeks | Workspace context, diff review, rules |
| **2** | Agent | 8–12 weeks | Multi-file agent, local models, checkpoints |
| **3** | Ecosystem | Ongoing | Extensions, team features, eval CI |

**Prerequisite:** All “Must have before Phase 0” documents in [DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md) are complete.

---

## Phase 0 — Foundation

**Goal:** Daily-usable editor with one cloud model and minimal AI.

### Deliverables

- [ ] Fork Code-OSS; rebrand (name, icons, update channel)
- [ ] Build pipeline: dev, package, CI on GitHub Actions
- [ ] Settings: API keys (keychain), model picker, privacy toggle
- [ ] Inline completion on active file (Monaco provider)
- [ ] Basic chat sidebar with `@currentFile`
- [ ] Streaming responses in webview

### Exit Criteria

- Developer can install, add API key, get completions and chat on open file
- No regressions in core editor, terminal, or file explorer vs upstream

### Out of Scope

- Agent multi-file edits
- Vector search
- Extension marketplace

---

## Phase 1 — Context & Trust

**Goal:** AI understands the project; edits are reviewable.

### Deliverables

- [ ] Workspace symbol index (Tree-sitter + LSP)
- [ ] `@workspace`, `@folder`, `@git` in chat
- [ ] Diagnostics and test output in context
- [ ] Diff review UI for AI-proposed edits (per-hunk accept/reject)
- [ ] Project rules file: `.ide/rules`
- [ ] Secret scanner before cloud prompts

### Exit Criteria

- Multi-file questions return relevant answers on benchmark repos
- All AI file changes go through diff review by default
- Secrets in `.env` are blocked or redacted in outbound prompts

### Out of Scope

- Autonomous agent loops
- Team sync

---

## Phase 2 — Agent

**Goal:** Feature-sized tasks with guardrails.

### Deliverables

- [ ] Agent orchestrator with planner + tool loop
- [ ] Tools: read, write (staged), search, terminal (approved), run tests
- [ ] Composer UI for multi-step tasks
- [ ] Checkpoints and rollback before/after agent runs
- [ ] Ollama integration for local models
- [ ] Optional vector retrieval for large repos
- [ ] Audit log (local; export for enterprise)

### Exit Criteria

- “Implement X across these files” completes with user accepting ≥1 hunk
- User can cancel and rollback agent run
- Local-only mode works with Ollama without cloud calls

### Out of Scope

- Full extension marketplace
- Cloud team admin

---

## Phase 3 — Ecosystem

**Goal:** Scale adoption, extensions, and quality.

### Deliverables

- [ ] VS Code extension compatibility (phased allowlist → broader)
- [ ] Skills marketplace or shared rules repository
- [ ] Optional cloud sync (settings, rules — not code)
- [ ] Team admin: model policies, audit export
- [ ] AI eval CI on golden repositories
- [ ] Performance: optional Rust sidecar for indexing

### Exit Criteria

- Top N VS Code extensions pass compatibility matrix
- AI eval suite runs on every release candidate
- Documented upgrade path for teams from VS Code + Copilot

---

## Pre-Implementation Gate

Do **not** start Phase 0 code until:

1. [DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md) — all “Must have” items checked
2. ADR-001 (Code-OSS fork) signed off
3. PRD v1 scope agreed (see checklist)
4. Legal review started for Code-OSS attribution and trademark/branding

---

## Milestone Timeline (Illustrative)

```
Month 1–2   Phase 0   ████████░░░░░░░░░░░░
Month 2–4   Phase 1   ░░░░████████░░░░░░░░
Month 4–7   Phase 2   ░░░░░░░░████████████
Month 7+    Phase 3   ░░░░░░░░░░░░████████ → ongoing
```

Adjust after Phase 0 velocity is measured.

---

## Risk Register (Summary)

| Risk | Mitigation |
|------|------------|
| Upstream merge pain | Isolate changes in `src/vs/platform/ecosystems/`; monthly sync discipline |
| AI quality inconsistent | AI eval harness from Phase 1 |
| Extension incompatibility | Curated allowlist first |
| Security incident (keys, prompts) | Keychain, secret scanner, local-only mode |
| Scope creep | Strict phase exit criteria; PRD non-goals |
