# Phase 0 Sprint Backlog

Actionable work items for **Altus IDE Phase 0** (Foundation).

**Duration:** 5–6 weeks  
**PRD:** [PRD-v1-phase0.md](../product/PRD-v1-phase0.md)  
**Last updated:** 2026-05-30

---

## Epic Overview

| Epic | ID | Stories | Target week |
|------|-----|---------|-------------|
| Fork & build | E1 | 5 | 1 |
| Platform AI services | E2 | 6 | 2 |
| Chat sidebar | E3 | 5 | 2–3 |
| Inline completion | E4 | 4 | 3 |
| Polish & CI | E5 | 5 | 4–6 |

---

## E1 — Fork & Build Infrastructure

| ID | Story | Tasks | Est. | Done |
|----|-------|-------|------|------|
| E1-01 | Initial Code-OSS fork | Clone tag 1.96.x; remotes; first commit | 2d | ☐ |
| E1-02 | Branding | `product.json`, icons, about dialog | 1d | ☐ |
| E1-03 | Dev setup doc validated | Engineer follows `setup.md`; fix gaps | 1d | ☐ |
| E1-04 | EcoSystems contribution scaffold | `contrib/ecosystems/` empty registration | 0.5d | ☐ |
| E1-05 | Git repo + branch strategy | `main`, `develop`, PR template | 0.5d | ☐ |

**E1 exit:** App launches as Altus IDE; explorer + terminal work.

---

## E2 — Platform AI Services

| ID | Story | Tasks | Est. | Done |
|----|-------|-------|------|------|
| E2-01 | Service registration | DI: `IAiService`, `IModelRouterService`, `ISecretsService` | 1d | ☐ |
| E2-02 | Session keychain | Store EcoSystems session/refresh token; sign-in/out | 1d | ☐ |
| E2-03 | Settings schema | Register `ecosystems.ai.*` (gateway, models; no BYOK) | 0.5d | ☐ |
| E2-04 | Gateway provider | Stream chat + inline to Altus AI Gateway | 2d | ☐ |
| E2-05 | Model router | Route by feature; kill switch; connection test | 1d | ☐ |
| E2-06 | Context builder (Phase 0) | Cursor region + file attach + templates | 1.5d | ☐ |
| E2-07 | Gateway service (dev) | Local `localhost:8080` API + mock/plan tiers | 2d | ☐ |

**E2 exit:** Signed-in dev can send test prompt through gateway (upstream keys server-side only).

---

## E3 — Chat Sidebar

| ID | Story | Tasks | Est. | Done |
|----|-------|-------|------|------|
| E3-01 | Activity bar + view container | AI icon; sidebar slot | 0.5d | ☐ |
| E3-02 | Chat webview shell | HTML/CSS/TS; message list; input box | 1.5d | ☐ |
| E3-03 | postMessage protocol | send, stream chunks, cancel, error | 1d | ☐ |
| E3-04 | `@currentFile` attach | Selection priority; truncation; warning banner | 1d | ☐ |
| E3-05 | Settings UI for AI | Sign-in, model picker, test connection, enable toggle | 1.5d | ☐ |

**E3 exit:** User chats about open file with streaming response.

---

## E4 — Inline Completion

| ID | Story | Tasks | Est. | Done |
|----|-------|-------|------|------|
| E4-01 | Inline provider registration | Monaco inline completions API | 1d | ☐ |
| E4-02 | Debounce + cancel | 300ms debounce; cancel on cursor move | 0.5d | ☐ |
| E4-03 | Context + router wiring | Cursor region template → stream | 1d | ☐ |
| E4-04 | Status bar indicator | Model name; inline on/off | 0.5d | ☐ |

**E4 exit:** Tab accepts ghost text in `.ts` file.

---

## E5 — Polish, CI & Release Prep

| ID | Story | Tasks | Est. | Done |
|----|-------|-------|------|------|
| E5-01 | Error states | 401, 429, offline, no key | 1d | ☐ |
| E5-02 | Unit tests | Router, keychain, context allocator | 1.5d | ☐ |
| E5-03 | GitHub Actions CI | `yarn compile` + unit on PR | 1d | ☐ |
| E5-04 | E2E smoke | Launch, open file, one chat round | 1d | ☐ |
| E5-05 | Windows package script | electron-builder or vscode packaging | 1.5d | ☐ |

**E5 exit:** CI green; Windows build artifact; Phase 0 sign-off ready.

---

## Dependency Graph

```
E1 ──► E2 ──► E3
         └──► E4
E3 + E4 ──► E5
```

E3 and E4 can run in parallel after E2 completes.

---

## Sprint Plan (Suggested)

### Sprint 1 (Week 1)
- E1-01 → E1-05
- Start E2-01, E2-02

### Sprint 2 (Week 2)
- E2-03 → E2-06
- E3-01 → E3-03

### Sprint 3 (Week 3)
- E3-04 → E3-05
- E4-01 → E4-04

### Sprint 4 (Week 4)
- E5-01 → E5-03

### Sprint 5–6 (Buffer)
- E5-04 → E5-05
- Bug fixes, docs, sign-off

---

## Definition of Done (Story Level)

- [ ] Code merged to `develop` via PR
- [ ] Unit tests for service logic (where applicable)
- [ ] No API keys in code or logs
- [ ] Matches PRD acceptance criteria for feature ID
- [ ] Manual smoke on Windows

---

## Out of Backlog (Explicitly Deferred)

- Agent / composer UI
- Ollama provider
- Secret scanner enforcement
- Extension marketplace
- macOS signed build
- React webview refactor

---

## Risks & Blockers Log

| Date | Item | Owner | Status |
|------|------|-------|--------|
| | | | |

---

## Related Documents

- [PRD v1 Phase 0](../product/PRD-v1-phase0.md)
- [repo-layout.md](../architecture/repo-layout.md)
- [sign-off.md](./sign-off.md)
