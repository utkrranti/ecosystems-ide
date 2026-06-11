# Definition of Done

When a story, epic, or phase is **complete** for Altus IDE.

**Last updated:** 2026-05-30

---

## 1. Story-Level DoD (Every PR)

- [ ] Code merged to `develop` via approved PR
- [ ] Matches acceptance criteria in [PRD](../product/PRD-v1-phase0.md) or backlog story
- [ ] EcoSystems code under `src/vs/platform/ecosystems/` or `contrib/ecosystems/`
- [ ] No API keys, secrets, or `.env` in diff
- [ ] Unit tests added/updated for service logic ([testing-strategy.md](./testing-strategy.md))
- [ ] `yarn compile` passes locally
- [ ] `yarn test --grep ecosystems` passes (or full suite if touched shared code)
- [ ] Manual smoke for UI changes (note in PR description)
- [ ] Docs updated if behavior, setup, or settings changed

---

## 2. UI / Webview Story DoD (Additional)

- [ ] `data-testid` on new interactive webview elements
- [ ] Works in **dark and light** theme
- [ ] Keyboard accessible (focus, Enter/Esc)
- [ ] Error state handled (not silent fail)
- [ ] E2E or integration test for critical path when feasible
- [ ] Screenshot in PR if visual change

---

## 3. Epic Exit Criteria

### E1 — Fork & Build
- App launches as Altus IDE; explorer + terminal work
- [setup.md](../dev/setup.md) validated by engineer

### E2 — Platform AI Services
- Dev command or test sends mock/real prompt through router
- Keychain unit tests green

### E3 — Chat Sidebar
- User chats with streaming response in webview
- Webview protocol integration test green

### E4 — Inline Completion
- Tab accepts ghost text in TypeScript file

### E5 — Polish & CI
- CI green; E2E smoke passes; Windows build artifact exists

---

## 4. Phase 0 DoD (Release v0.1.0)

All items in [sign-off.md](../program/sign-off.md) **Gate B**, plus:

- [ ] All PRD features F-001–F-042 done or explicitly deferred with ADR/note
- [ ] [Manual QA checklist](./testing-strategy.md#8-manual-qa-checklist-phase-0) completed
- [ ] Known limitations documented ([non-goals.md](../product/non-goals.md))
- [ ] Prompt data policy linked from in-app settings

---

## 5. Phase 1+ DoD (Preview)

| Phase | Extra gates |
|-------|-------------|
| 1 | Secret scanner blocks `.env`; diff review UI; AI eval harness runs |
| 2 | Agent rollback works; Ollama local-only mode |
| 3 | Extension compatibility matrix published |

---

## 6. Related Documents

- [testing-strategy.md](./testing-strategy.md)
- [PRD v1 Phase 0](../product/PRD-v1-phase0.md)
- [sign-off.md](../program/sign-off.md)
