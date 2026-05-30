# Documentation Checklist — Before Real Implementation

Complete every **Must have** document before writing production code (Phase 0). **Should have** items can run in parallel with early Phase 0 spikes if clearly scoped.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Written (in this repo) |
| ⬜ | Not started |
| 🔶 | In progress |
| **M** | Must have before Phase 0 code |
| **S** | Should have before Phase 0 exit |
| **P** | Needed before Phase 1+ |

---

## 1. Product & Strategy

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 1.1 | Product vision & north star | `docs/01-product-vision.md` | **M** | ✅ |
| 1.2 | Tech stack reference | `docs/02-tech-stack.md` | **M** | ✅ |
| 1.3 | Solution architecture | `docs/03-solution-architecture.md` | **M** | ✅ |
| 1.4 | Product roadmap | `docs/04-roadmap.md` | **M** | ✅ |
| 1.5 | Architectural decisions (ADR log) | `docs/05-architectural-decisions.md` | **M** | ✅ |
| 1.6 | **PRD v1 — Phase 0 scope** | `docs/product/PRD-v1-phase0.md` | **M** | ✅ |
| 1.7 | **Non-goals & out-of-scope register** | `docs/product/non-goals.md` | **M** | ✅ |
| 1.8 | Competitive analysis (VS Code, Cursor, Windsurf, Zed) | `docs/product/competitive-analysis.md` | **S** | ⬜ |
| 1.9 | Personas & user journeys (expanded) | `docs/product/personas-and-journeys.md` | **S** | ⬜ |
| 1.10 | Success metrics & KPI definitions | `docs/product/metrics.md` | **S** | ⬜ |
| 1.11 | Pricing / licensing model (if commercial) | `docs/product/licensing.md` | **P** | ⬜ |

---

## 2. UX & Design

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 2.1 | **Workbench IA & wireframes** | `docs/design/workbench-ia.md` | **M** | ✅ |
| 2.2 | **AI chat panel UX spec** | `docs/design/ai-chat-panel.md` | **M** | ✅ |
| 2.3 | **Inline completion UX** (ghost text, accept/dismiss) | `docs/design/inline-completion.md` | **M** | ✅ |
| 2.4 | **Diff review & apply flow** | `docs/design/diff-review-flow.md` | **S** | ⬜ |
| 2.5 | Composer / agent UX (Phase 2 preview) | `docs/design/composer-agent.md` | **P** | ⬜ |
| 2.6 | Design system (tokens, components, icons) | `docs/design/design-system.md` | **S** | ⬜ |
| 2.7 | Keyboard shortcuts map | `docs/design/keybindings.md` | **S** | ⬜ |
| 2.8 | Accessibility requirements (WCAG target) | `docs/design/accessibility.md` | **S** | ⬜ |
| 2.9 | Empty states, errors, loading patterns | `docs/design/states-and-errors.md` | **S** | ⬜ |
| 2.10 | `@` context picker interaction spec | `docs/design/context-picker.md` | **S** | ⬜ |

---

## 3. Architecture & Engineering

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 3.1 | **Repository layout & module boundaries** | `docs/architecture/repo-layout.md` | **M** | ✅ |
| 3.2 | **Code-OSS fork & upstream sync procedure** | `docs/architecture/upstream-sync.md` | **M** | ✅ |
| 3.3 | **AI context pipeline spec** | `docs/architecture/ai-context-pipeline.md` | **M** | ✅ |
| 3.4 | **Model router & provider interface** | `docs/architecture/model-router.md` | **M** | ✅ |
| 3.5 | Agent runtime & tool sandbox (Phase 2) | `docs/architecture/agent-runtime.md` | **P** | ⬜ |
| 3.6 | Extension compatibility matrix | `docs/architecture/extension-compatibility.md` | **P** | ⬜ |
| 3.7 | Indexing & search (ripgrep, tree-sitter, vectors) | `docs/architecture/indexing.md` | **S** | ⬜ |
| 3.8 | Settings & configuration schema | `docs/architecture/settings-schema.md` | **M** | ✅ |
| 3.9 | `.ide/rules` and skills file format | `docs/architecture/rules-and-skills-format.md` | **S** | ⬜ |
| 3.10 | API: extension hooks for AI context | `docs/architecture/ai-extension-api.md` | **P** | ⬜ |

---

## 4. Security, Privacy & Compliance

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 4.1 | **Threat model** | `docs/security/threat-model.md` | **M** | ✅ |
| 4.2 | **Secrets & API key handling** | `docs/security/secrets-and-keychain.md` | **M** | ✅ |
| 4.3 | **Prompt data policy** (what leaves the machine) | `docs/security/prompt-data-policy.md` | **M** | ✅ |
| 4.4 | Agent sandbox & approval rules | `docs/security/agent-sandbox.md` | **S** | ⬜ |
| 4.5 | Telemetry & analytics (opt-in schema) | `docs/security/telemetry.md` | **S** | ⬜ |
| 4.6 | OSS licenses & third-party attribution | `docs/legal/oss-attribution.md` | **M** | ✅ |
| 4.7 | Trademark / branding guidelines (vs VS Code) | `docs/legal/branding.md` | **M** | ✅ |

---

## 5. DevOps, Build & Release

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 5.1 | **Development environment setup** | `docs/dev/setup.md` | **M** | ✅ |
| 5.2 | **Build & compile guide** | `docs/dev/build.md` | **M** | ✅ |
| 5.3 | **CI/CD pipeline design** | `docs/dev/ci-cd.md` | **M** | ✅ |
| 5.4 | Release & versioning strategy (semver) | `docs/dev/release-strategy.md` | **S** | ⬜ |
| 5.5 | Code signing & notarization | `docs/dev/code-signing.md` | **S** | ⬜ |
| 5.6 | Auto-update mechanism | `docs/dev/auto-update.md` | **S** | ⬜ |
| 5.7 | Branching & contribution workflow | `docs/dev/contributing.md` | **S** | ✅ |

---

## 6. Quality & Testing

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 6.1 | **Testing strategy** (unit, e2e, manual) | `docs/quality/testing-strategy.md` | **M** | ✅ |
| 6.2 | **AI eval harness design** | `docs/quality/ai-eval-harness.md` | **S** | ⬜ |
| 6.3 | Benchmark repository list (golden repos) | `docs/quality/benchmark-repos.md` | **S** | ⬜ |
| 6.4 | Performance budgets (startup, memory, index) | `docs/quality/performance-budgets.md` | **S** | ⬜ |
| 6.5 | Definition of Done per phase | `docs/quality/definition-of-done.md` | **M** | ✅ |

---

## 7. AI / ML Specific

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 7.1 | **Supported models matrix (Phase 0)** | `docs/ai/models-matrix.md` | **M** | ✅ |
| 7.2 | **Prompt templates catalog** | `docs/ai/prompt-templates.md` | **M** | ✅ |
| 7.3 | Token budget & context window policy | `docs/ai/token-budget.md` | **S** | ⬜ |
| 7.4 | Inline vs chat vs agent routing rules | `docs/ai/intent-routing.md` | **S** | ⬜ |
| 7.5 | Ollama / local model setup guide | `docs/ai/local-models.md` | **S** | ⬜ |
| 7.6 | Failure modes & fallbacks (rate limits, offline) | `docs/ai/failure-modes.md` | **S** | ⬜ |

---

## 8. Program Management

| # | Document | Path (planned) | Priority | Status |
|---|----------|----------------|----------|--------|
| 8.1 | **Phase 0 sprint backlog** | `docs/program/phase0-backlog.md` | **M** | ✅ |
| 8.2 | RACI / team roles | `docs/program/raci.md` | **S** | ⬜ |
| 8.3 | Risk register (living doc) | `docs/program/risk-register.md` | **S** | ⬜ |
| 8.4 | Stakeholder sign-off checklist | `docs/program/sign-off.md` | **M** | ✅ |

---

## Summary Counts

| Category | Must (M) | Should (S) | Phase 1+ (P) | Done |
|----------|----------|------------|--------------|------|
| Product & strategy | 7 | 3 | 1 | 7 / 11 |
| UX & design | 3 | 6 | 1 | 3 / 10 |
| Architecture | 5 | 2 | 3 | 5 / 11 |
| Security & legal | 5 | 2 | 0 | 5 / 7 |
| DevOps | 3 | 4 | 0 | 3 / 7 |
| Quality | 2 | 3 | 0 | 2 / 5 |
| AI / ML | 2 | 4 | 0 | 2 / 6 |
| Program | 2 | 2 | 0 | 2 / 4 |
| **Total** | **29** | **26** | **5** | **29 / 61** |

---

## Minimum Bar to Start Phase 0 Implementation

All **29 “Must have”** documents must be ✅, plus:

- [ ] ADR-001 through ADR-010 reviewed and accepted
- [ ] PRD v1 signed off (scope frozen for Phase 0)
- [ ] Threat model + prompt data policy reviewed
- [ ] Dev machine can build fork (setup.md validated by one engineer)
- [ ] Git repository initialized with branch strategy

---

## Recommended Writing Order

*(For doc authors — readers use [READING-SEQUENCE.md](./READING-SEQUENCE.md).)*

1. **PRD v1 Phase 0** — freezes scope
2. **Threat model + prompt data policy** — constraints for design  
3. **Repo layout + upstream sync** — unblocks fork spike  
4. **Dev setup + build + CI/CD** — unblocks daily development  
5. **AI context pipeline + model router** — unblocks AI spike  
6. **UX specs** (chat, inline, workbench IA) — unblocks UI  
7. **Testing strategy + Phase 0 backlog** — unblocks sprint planning  
8. **Sign-off checklist** — gate before merge to `main` development branch  

---

## Folder Structure (Target)

```
docs/
├── README.md                          ✅
├── 01-product-vision.md               ✅
├── 02-tech-stack.md                   ✅
├── 03-solution-architecture.md        ✅
├── 04-roadmap.md                      ✅
├── 05-architectural-decisions.md      ✅
├── DOCUMENTATION-CHECKLIST.md         ✅ (this file)
├── product/                       ✅ PRD, non-goals
├── design/                        ✅ workbench, chat, inline
├── architecture/                  ✅ repo, sync, context, router, settings
├── security/                      ✅ threat model, prompt policy, secrets
├── legal/                         ✅ oss-attribution, branding
├── dev/                           ✅ setup, build, contributing, ci-cd, fork-spike
├── quality/                       ✅ testing strategy, DoD
├── ai/                            ✅ models, prompts
└── program/                       ✅ backlog, sign-off
```

Subfolders created as documents are written.
