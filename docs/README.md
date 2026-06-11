# Altus IDE — Documentation

Planning and architecture for a VS Code–class desktop editor with native AI.

## Start here

**New to the project?** Read [READING-SEQUENCE.md](./READING-SEQUENCE.md) — ordered paths for engineers, UX, and sign-off.

## Status

| Metric | Value |
|--------|-------|
| Docs written | **32 / 61** (+ fork-spike helper) |
| **Must-have docs (Phase 0)** | **29 / 29 ✅** |
| Implementation | Not started — **fork spike next** |
| Git | Initialized |

## Document Index

### Core planning

| Document | Description |
|----------|-------------|
| [01-product-vision.md](./01-product-vision.md) | North star, personas, pillars |
| [02-tech-stack.md](./02-tech-stack.md) | Full technology stack |
| [03-solution-architecture.md](./03-solution-architecture.md) | System design |
| [04-roadmap.md](./04-roadmap.md) | Phase 0–3 plan |
| [05-architectural-decisions.md](./05-architectural-decisions.md) | ADR-001–010 |

### Product

| Document | Status |
|----------|--------|
| [PRD v1 Phase 0](./product/PRD-v1-phase0.md) | ✅ |
| [Non-goals](./product/non-goals.md) | ✅ |

### Design

| Document | Status |
|----------|--------|
| [Workbench IA](./design/workbench-ia.md) | ✅ |
| [AI chat panel](./design/ai-chat-panel.md) | ✅ |
| [Inline completion](./design/inline-completion.md) | ✅ |

### Architecture

| Document | Status |
|----------|--------|
| [Repo layout](./architecture/repo-layout.md) | ✅ |
| [Upstream sync](./architecture/upstream-sync.md) | ✅ |
| [AI context pipeline](./architecture/ai-context-pipeline.md) | ✅ |
| [Model router](./architecture/model-router.md) | ✅ |
| [Settings schema](./architecture/settings-schema.md) | ✅ |

### Security

| Document | Status |
|----------|--------|
| [Threat model](./security/threat-model.md) | ✅ |
| [Prompt data policy](./security/prompt-data-policy.md) | ✅ |
| [Secrets & keychain](./security/secrets-and-keychain.md) | ✅ |

### Legal

| Document | Status |
|----------|--------|
| [OSS attribution](./legal/oss-attribution.md) | ✅ |
| [Branding guidelines](./legal/branding.md) | ✅ |

### Dev

| Document | Status |
|----------|--------|
| [Setup](./dev/setup.md) | ✅ |
| [Build](./dev/build.md) | ✅ |
| [Contributing](./dev/contributing.md) | ✅ |
| [CI/CD](./dev/ci-cd.md) | ✅ |
| [Fork spike checklist](./dev/fork-spike-checklist.md) | ✅ |

### AI

| Document | Status |
|----------|--------|
| [Models matrix](./ai/models-matrix.md) | ✅ |
| [Prompt templates](./ai/prompt-templates.md) | ✅ |

### Quality

| Document | Status |
|----------|--------|
| [Testing strategy](./quality/testing-strategy.md) | ✅ |
| [Definition of done](./quality/definition-of-done.md) | ✅ |

### Program

| Document | Status |
|----------|--------|
| [Phase 0 backlog](./program/phase0-backlog.md) | ✅ |
| [Sign-off checklist](./program/sign-off.md) | ✅ |

### Master checklist

[DOCUMENTATION-CHECKLIST.md](./DOCUMENTATION-CHECKLIST.md)

---

## Gate before coding

All **29 must-have docs** are written. Remaining gates ([sign-off.md](./program/sign-off.md) Gate A):

1. Stakeholder sign-off on docs
2. **[Fork spike](./dev/fork-spike-checklist.md)** — build Code-OSS locally
3. Branding icon assets
4. Dev API keys (not committed)

## Code path standard

`src/vs/platform/ecosystems/` + `src/vs/workbench/contrib/ecosystems/`

## Testing

[testing-strategy.md](./quality/testing-strategy.md) · [test/README.md](../test/README.md)
