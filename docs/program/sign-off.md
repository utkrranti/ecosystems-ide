# Stakeholder Sign-Off Checklist

Gate checklist before **Phase 0 implementation begins** and before **Phase 0 release**.

**Last updated:** 2026-05-30

---

## Gate A — Start Phase 0 Implementation

All items must be checked before first AI feature code merges to `develop`.

### Documentation

| # | Item | Owner | Status |
|---|------|-------|--------|
| A1 | [PRD v1 Phase 0](../product/PRD-v1-phase0.md) approved | Product | ☐ |
| A2 | [Non-goals](../product/non-goals.md) reviewed | Product | ☐ |
| A3 | [Threat model](../security/threat-model.md) reviewed | Security | ☐ |
| A4 | [Prompt data policy](../security/prompt-data-policy.md) reviewed | Security / Legal | ☐ |
| A5 | [Secrets handling](../security/secrets-and-keychain.md) reviewed | Engineering | ☐ |
| A6 | [Repo layout](../architecture/repo-layout.md) agreed | Engineering | ☐ |
| A7 | [Upstream sync](../architecture/upstream-sync.md) agreed | Engineering | ☐ |
| A8 | [AI context pipeline](../architecture/ai-context-pipeline.md) agreed | Engineering | ☐ |
| A9 | [Model router](../architecture/model-router.md) agreed | Engineering | ☐ |
| A10 | [Settings schema](../architecture/settings-schema.md) agreed | Engineering | ☐ |
| A11 | [Phase 0 backlog](./phase0-backlog.md) committed | Engineering | ☐ |
| A12 | ADR-001 through ADR-010 accepted | Architecture | ☐ |

### Engineering readiness

| # | Item | Owner | Status |
|---|------|-------|--------|
| A13 | Git repository initialized | Engineering | ☐ |
| A14 | Branch strategy documented (`main`, `develop`) | Engineering | ☐ |
| A15 | Code-OSS fork spike: builds on dev machine ([checklist](../dev/fork-spike-checklist.md)) | Engineering | ☐ |
| A16 | Dev API keys available for team (not committed) | Engineering | ☐ |
| A17 | Icon / branding assets ready | Design | ☐ |

### Legal & compliance (minimum)

| # | Item | Owner | Status |
|---|------|-------|--------|
| A18 | [OSS attribution](../legal/oss-attribution.md) acknowledged | Legal | ☐ |
| A19 | [Branding guidelines](../legal/branding.md) — no VS Code trademark misuse | Legal / Design | ☐ |
| A20 | Prompt data policy acceptable for beta users | Legal | ☐ |

### Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product lead | | | ☐ |
| Engineering lead | | | ☐ |
| Security / Legal | | | ☐ |

**Gate A result:** ☐ Approved to start Phase 0 implementation

---

## Gate B — Phase 0 Release (v0.1.0)

Before tagging `v0.1.0` and distributing externally.

### Functional

| # | Item | Status |
|---|------|--------|
| B1 | All PRD Phase 0 features (F-001–F-042) complete or explicitly deferred | ☐ |
| B2 | Inline completion works on TypeScript sample project | ☐ |
| B3 | Chat with `@currentFile` streams correctly | ☐ |
| B4 | API key in keychain survives restart | ☐ |
| B5 | AI disable toggle stops all LLM HTTP calls | ☐ |
| B6 | Explorer, terminal, LSP smoke pass | ☐ |

### Quality

| # | Item | Status |
|---|------|--------|
| B7 | CI green on `main` | ☐ |
| B8 | Unit tests for router, keychain, context | ☐ |
| B9 | E2E smoke test passes | ☐ |
| B10 | No P0/P1 bugs open | ☐ |

### Security

| # | Item | Status |
|---|------|--------|
| B11 | Settings export contains no API keys | ☐ |
| B12 | Logs scanned for key leakage | ☐ |
| B13 | Prompt data policy published in app (link in settings) | ☐ |
| B14 | `.env` warning shown when attached to chat | ☐ |

### Release

| # | Item | Status |
|---|------|--------|
| B15 | Windows build artifact produced | ☐ |
| B16 | Release notes drafted | ☐ |
| B17 | Known limitations documented (non-goals) | ☐ |
| B18 | Version in `product.json` matches tag | ☐ |

### Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product lead | | | ☐ |
| Engineering lead | | | ☐ |
| QA | | | ☐ |

**Gate B result:** ☐ Approved for v0.1.0 release

---

## Notes

- Partial sign-off is not valid for Gate A — defer missing docs rather than starting code.
- Gate B may ship without code signing / auto-update if documented in release notes.

---

## Change Log

| Date | Change |
|------|--------|
| 2026-05-30 | Initial checklist |
