# Documentation Reading Sequence

Recommended order for reading Altus IDE docs **before and during Phase 0 development**.

**Time:** ~2–3 hours for the full engineer path; ~45 minutes for the essentials.

---

## Are we ready to develop?

| Gate | Status |
|------|--------|
| Must-have docs (29) | ✅ Written |
| Reading sequence | ✅ This document |
| Git repo | ✅ Initialized (docs only; no fork yet) |
| Fork spike (Code-OSS builds) | ❌ Not done |
| Gate A sign-off | ❌ Checkboxes open |
| Source code / fork | ❌ Not started |
| Icon assets | ❌ Not ready |

**Verdict:** Ready to start **Phase 0a — fork spike & infra** (Epic E1).  
**Not yet ready** to merge **AI feature code** (Epic E2+) until fork spike passes and Gate A is signed off.

---

## Path 1 — Everyone (30 min)

Read in order. Skipping leaves blind spots on scope and trust.

| # | Document | Why |
|---|----------|-----|
| 1 | [01-product-vision.md](./01-product-vision.md) | North star, pillars, who we build for |
| 2 | [product/PRD-v1-phase0.md](./product/PRD-v1-phase0.md) | **What ships in v0.1** — scope contract |
| 3 | [product/non-goals.md](./product/non-goals.md) | What we explicitly will not build |
| 4 | [04-roadmap.md](./04-roadmap.md) | Phase 0 → 3 timeline |
| 5 | [05-architectural-decisions.md](./05-architectural-decisions.md) | ADR-001–010 (fork, AI core, monorepo, etc.) |

---

## Path 2 — Engineer starting fork spike (Epic E1)

After Path 1, read before cloning Code-OSS:

| # | Document | Why |
|---|----------|-----|
| 6 | [02-tech-stack.md](./02-tech-stack.md) | Electron, TypeScript, tools |
| 7 | [architecture/repo-layout.md](./architecture/repo-layout.md) | Where EcoSystems code lives |
| 8 | [architecture/upstream-sync.md](./architecture/upstream-sync.md) | Clone, brand, merge upstream |
| 9 | [dev/setup.md](./dev/setup.md) | Prerequisites, install, launch |
| 10 | [dev/build.md](./dev/build.md) | Compile, watch, package |
| 11 | [dev/fork-spike-checklist.md](./dev/fork-spike-checklist.md) | **Execute this** — Gate A15 |
| 12 | [dev/contributing.md](./dev/contributing.md) | Branches, commits, PRs |
| 13 | [dev/ci-cd.md](./dev/ci-cd.md) | Add CI after fork works |
| 14 | [legal/oss-attribution.md](./legal/oss-attribution.md) | LICENSE, ThirdPartyNotices |
| 15 | [legal/branding.md](./legal/branding.md) | Name, icons, VS Code trademark |

**Stop condition:** Fork spike checklist rows 1–9 ✅ → commit `chore: initial Code-OSS fork`.

---

## Path 3 — Engineer building AI features (Epic E2–E4)

After fork spike passes and Path 2 is done:

| # | Document | Why |
|---|----------|-----|
| 16 | [03-solution-architecture.md](./03-solution-architecture.md) | System diagram, data flows |
| 17 | [architecture/ai-context-pipeline.md](./architecture/ai-context-pipeline.md) | Context assembly, templates |
| 18 | [architecture/model-router.md](./architecture/model-router.md) | Providers, streaming, webview protocol |
| 19 | [architecture/settings-schema.md](./architecture/settings-schema.md) | `ecosystems.ai.*` keys |
| 20 | [ai/models-matrix.md](./ai/models-matrix.md) | Supported models |
| 21 | [ai/prompt-templates.md](./ai/prompt-templates.md) | Prompt catalog |
| 22 | [security/threat-model.md](./security/threat-model.md) | Threats, mitigations |
| 23 | [security/secrets-and-keychain.md](./security/secrets-and-keychain.md) | API key storage |
| 24 | [security/prompt-data-policy.md](./security/prompt-data-policy.md) | What leaves the machine |
| 25 | [quality/testing-strategy.md](./quality/testing-strategy.md) | Unit, E2E, webview tests |
| 26 | [quality/definition-of-done.md](./quality/definition-of-done.md) | PR and epic exit criteria |
| 27 | [program/phase0-backlog.md](./program/phase0-backlog.md) | Sprint stories E2–E5 |

---

## Path 4 — UI / UX (parallel with E3)

| # | Document | Why |
|---|----------|-----|
| 1–5 | Path 1 | Context |
| 6 | [design/workbench-ia.md](./design/workbench-ia.md) | Layout, activity bar, status bar |
| 7 | [design/ai-chat-panel.md](./design/ai-chat-panel.md) | Chat webview spec |
| 8 | [design/inline-completion.md](./design/inline-completion.md) | Ghost text, Tab/Esc |
| 9 | [architecture/model-router.md](./architecture/model-router.md) §7 | postMessage protocol |

---

## Path 5 — Product / stakeholder sign-off

| # | Document | Why |
|---|----------|-----|
| 1–5 | Path 1 | |
| 6 | [program/sign-off.md](./program/sign-off.md) | Gate A & B checklists |
| 7 | [security/prompt-data-policy.md](./security/prompt-data-policy.md) | Legal/privacy review |
| 8 | [legal/oss-attribution.md](./legal/oss-attribution.md) + [legal/branding.md](./legal/branding.md) | Compliance |

---

## Path 6 — Quick reference (already coding)

Keep these bookmarked:

| Need | Document |
|------|----------|
| Where to put code | [repo-layout.md](./architecture/repo-layout.md) |
| Settings keys | [settings-schema.md](./architecture/settings-schema.md) |
| Run tests | [testing-strategy.md](./quality/testing-strategy.md), [../test/README.md](../test/README.md) |
| Current sprint | [phase0-backlog.md](./program/phase0-backlog.md) |
| Out of scope? | [non-goals.md](./product/non-goals.md) |
| All docs index | [README.md](./README.md) |
| Completeness tracker | [DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md) |

---

## Visual flow

```
Path 1 (vision, PRD, ADRs)
        │
        ▼
Path 2 (fork spike) ──── Gate A15 ────┐
        │                              │
        ▼                              ▼
Path 3 (AI architecture)      Path 4 (UX specs)
        │                              │
        └──────────┬───────────────────┘
                   ▼
           Epic E2–E5 implementation
                   ▼
           Path 6 + testing-strategy
                   ▼
           Gate B → v0.1.0 release
```

---

## What to read later (not blocking Phase 0)

Optional / Phase 1+ docs from [DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md):

- Competitive analysis, expanded personas, metrics
- Diff review UX, design system, accessibility
- Agent runtime, Ollama guide, extension marketplace
- Release signing, auto-update, telemetry

---

## Related

- [program/sign-off.md](./program/sign-off.md) — formal Gate A / B
- [DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md) — writing order (for doc authors)
