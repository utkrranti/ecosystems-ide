# Non-Goals & Out-of-Scope Register

Living document of what EcoSystems IDE **will not** do (or not yet). Prevents scope creep during implementation.

**Last updated:** 2026-05-30

---

## How to Use

- Before adding a feature, check this list.
- To propose removing a non-goal, open an ADR and update the phase column.
- Items marked **Permanent** are strategic boundaries, not timing issues.

---

## Permanent Non-Goals

| ID | Non-goal | Rationale |
|----|----------|-----------|
| NG-P01 | Replace GitHub / GitLab | We integrate with git; we are not a forge |
| NG-P02 | Primary cloud/browser IDE | Desktop-first; web is not v1 product |
| NG-P03 | Silent autonomous file writes | Trust pillar; diffs required (ADR-004) |
| NG-P04 | Train custom foundation models | We route to existing models |
| NG-P05 | Imply Microsoft / VS Code endorsement | Separate brand; OSS attribution only |

---

## Phase 0 Non-Goals (Not in v0.1)

| ID | Non-goal | Target phase |
|----|----------|--------------|
| NG-001 | Agent / composer multi-file edits | Phase 2 |
| NG-002 | `@workspace`, `@folder`, `@git`, `@terminal` | Phase 1 |
| NG-003 | AI-proposed file edits / diff review UI | Phase 1 |
| NG-004 | Ollama / local LLM | Phase 2 |
| NG-005 | Vector / embedding search | Phase 2 |
| NG-006 | Extension marketplace | Phase 3 |
| NG-007 | `.ide/rules` project rules file | Phase 1 |
| NG-008 | Secret scanner before prompts | Phase 1 |
| NG-009 | Code signing & auto-update | Phase 0 exit / Phase 1 |
| NG-010 | Team sync, shared rules, admin console | Phase 3 |
| NG-011 | Telemetry / product analytics | Phase 1 (opt-in) |
| NG-012 | macOS/Linux signed installers | Phase 1 |
| NG-013 | Custom themes beyond default + dark/light | Phase 1 |
| NG-014 | User BYOK / paste provider API keys | Inbuilt via EcoSystems Gateway only (ADR-011) |

---

## Phase 1 Non-Goals

| ID | Non-goal | Target phase |
|----|----------|--------------|
| NG-101 | Full agent tool loop (terminal, tests) | Phase 2 |
| NG-102 | Checkpoints / rollback for AI edits | Phase 2 |
| NG-103 | Enterprise SSO / SAML | Phase 3 |
| NG-104 | Audit log export | Phase 2 |
| NG-105 | Broader extension marketplace | Phase 3 |

---

## Phase 2 Non-Goals

| ID | Non-goal | Target phase |
|----|----------|--------------|
| NG-201 | Mobile / tablet IDE | Future / companion app |
| NG-202 | Real-time collaborative editing | Not planned v1 |
| NG-203 | Built-in deployment pipelines | Integrate via extensions |
| NG-204 | Plugin marketplace for AI skills | Phase 3 |

---

## Explicit “Won’t Fix” (Low Priority)

| ID | Item | Reason |
|----|------|--------|
| WF-01 | Pixel-perfect VS Code clone | Different brand and AI surfaces |
| WF-02 | Support VS Code Insiders extensions API bleeding edge | Stability over bleeding edge |
| WF-03 | Offline editing requires AI | Editing always works; AI optional |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-05-30 | Initial register created with Phase 0 boundaries |
