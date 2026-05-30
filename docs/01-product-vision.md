# Product Vision

## North Star

**One sentence:** A fast, extensible developer environment where AI understands your whole project and helps you think, edit, debug, and ship — with the developer always in control.

## What “Like VS Code with AI” Means

| Layer | VS Code baseline | EcoSystems IDE differentiation |
|-------|------------------|--------------------------------|
| Editor | Monaco, multi-cursor, LSP | Same UX bar; AI inline + selection actions |
| Workbench | Explorer, search, SCM, terminal, debug | Same layout; AI panel as first-class citizen |
| Extensions | Large ecosystem | Compatible or curated subset at launch |
| AI | Optional third-party extensions | **Core platform capability** with unified context |

## Non-Goals (v1)

- Replacing GitHub or full DevOps platforms
- Building a browser-only cloud IDE as the primary product
- Competing on “most models” or model count alone
- Silent, unreviewed AI file writes

**Win on:** integrated workflow, project context, trust, and local/enterprise privacy — not on reinventing the editor chrome.

---

## Target Users

### Persona 1 — Professional Developer

- Spends 10+ hours/day in an editor
- **Jobs:** Understand unfamiliar code fast; implement features with fewer context switches
- **Pain:** Context switching between chat, docs, terminal, and editor

### Persona 2 — Full-Stack Builder

- Owns repo, terminal, tests, and deploy
- **Jobs:** Implement features; fix bugs using logs and test output
- **Pain:** AI tools that only see the current file

### Persona 3 — Team Lead

- Cares about standards, review, and onboarding
- **Jobs:** Keep changes safe and reviewable; share team conventions
- **Pain:** Uncontrolled AI edits and inconsistent behavior across the team

**Design principle:** Optimize for the **daily driver** (8–12 hours in the IDE), not the demo user who asks one question and leaves.

---

## Product Pillars

### Pillar A — Editor-First

AI never blocks typing. Completions, refactors, and explanations happen *in* the editor: ghost text, lightbulbs, peek, inline diff.

### Pillar B — Whole-Project Context

AI sees workspace structure, open files, git diff, diagnostics, test output, and terminal — not just the active buffer.

### Pillar C — Agent with Guardrails

Multi-file edits are **proposed changes** (diff review → accept/reject). No silent filesystem writes by default.

### Pillar D — Extensibility

Extensions and project-level rules/skills extend behavior without forking the core for every team.

### Pillar E — Local-First, Cloud-Optional

Editing works offline. AI can use local models (Ollama) or remote APIs. Privacy and air-gapped modes are explicit product modes.

---

## Workbench Information Architecture

Mirror VS Code muscle memory, then add AI as a first-class surface:

```
┌─────────────────────────────────────────────────────────────────┐
│ Activity Bar │  Sidebar          │  Editor Group(s)           │
│  Explorer    │  (Files / Search /  │  Tabs + Breadcrumbs         │
│  Search      │   SCM / AI Chat)    │  Monaco + inline AI         │
│  SCM         │                     │  Minimap                    │
│  Run/Debug   │                     │                             │
│  Extensions  │                     │                             │
│  AI ★        │                     │                             │
├──────────────┴─────────────────────┴────────────────────────────┤
│ Panel: Terminal │ Problems │ Output │ AI Transcript / Diffs      │
└─────────────────────────────────────────────────────────────────┘
│ Status: branch, errors, LSP, AI model, indexing, privacy mode    │
└─────────────────────────────────────────────────────────────────┘
```

### AI UX Patterns (Table Stakes)

| Surface | Purpose |
|---------|---------|
| Inline completion | Tab-to-accept ghost text in the editor |
| Chat sidebar | Q&A with `@file`, `@folder`, `@git`, `@terminal` |
| Composer / Agent | Multi-step tasks → staged file edits |
| Command palette | `AI: Explain`, `AI: Fix diagnostic`, `AI: Generate tests` |
| Diff review UI | Per-hunk accept/reject before apply |
| Rules / Skills | Project-level `.ide/rules`, reusable agent instructions |

---

## Trust & Safety UX

- **Always show diffs** before apply (default behavior)
- **Redact secrets** in prompts (`.env`, keys) via scanner before sending to models
- **Telemetry opt-in only** — no silent data collection
- **Cite context** — show which files/lines informed the suggestion where applicable
- **Audit log** (enterprise) — what AI read, wrote, and ran

---

## Success Metrics

### Product

| Metric | Target direction |
|--------|------------------|
| Time to first value | Install → first useful completion in under 2 minutes |
| Engagement | Weekly active *editing* hours, not just chat opens |
| Inline acceptance | AI suggestion acceptance rate |
| Agent success | Agent tasks where user accepts ≥1 hunk |

### Quality

| Metric | Target direction |
|--------|------------------|
| Context relevance | Human eval on benchmark repos |
| Regression | No broken LSP / debug / terminal after AI features ship |

### Business (if applicable)

- Team adoption and seat retention
- Upgrade on agent / advanced model tiers
