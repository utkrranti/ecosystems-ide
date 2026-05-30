# Fork Spike Validation Checklist

One-time validation that Code-OSS builds as **EcoSystems IDE** on a developer machine.

**Gate:** [sign-off.md](../program/sign-off.md) item **A15**  
**Duration:** 1–3 days  
**Last updated:** 2026-05-30

---

## Purpose

Prove the technical foundation before AI implementation. If this spike fails, fix tooling before writing feature code.

---

## Prerequisites

Complete [setup.md](./setup.md) prerequisites (Node 20, Python, VS Build Tools, yarn).

---

## Spike Steps

| # | Task | Done |
|---|------|------|
| 1 | Clone Code-OSS tag (e.g. `1.96.2`) per [upstream-sync.md](../architecture/upstream-sync.md) | ☐ |
| 2 | Apply branding (`product.json`, icons) | ☐ |
| 3 | `yarn` completes without error | ☐ |
| 4 | `yarn compile` completes without error | ☐ |
| 5 | App launches via `scripts/code.bat` | ☐ |
| 6 | Window title shows **EcoSystems IDE** | ☐ |
| 7 | Open folder → explorer lists files | ☐ |
| 8 | Integrated terminal runs command | ☐ |
| 9 | TypeScript file shows LSP diagnostics | ☐ |
| 10 | Commit to `develop`: `chore: initial Code-OSS fork` | ☐ |

---

## Record Results

| Field | Value |
|-------|-------|
| Engineer | |
| Date | |
| OS | Windows 10 / 11 / macOS / Linux |
| Code-OSS tag | e.g. 1.96.2 |
| Node version | |
| Compile time (first) | minutes |
| Issues found | |

Post results in PR or team channel; update [setup.md](./setup.md) if steps were wrong.

---

## Failure Escalation

| Failure | Action |
|---------|--------|
| `yarn` native module build | Fix VS Build Tools / Linux deps |
| OOM on compile | `NODE_OPTIONS=--max-old-space-size=8192` |
| Wrong product name | Re-run branding; check `product.json` |
| Cannot launch | Check `out/` exists; run from Developer PowerShell |

Do **not** proceed to AI epics (E2–E5) until rows 1–9 pass.

---

## After Spike

- [ ] Push fork to `origin`
- [ ] Create `develop` branch
- [ ] Add `.github/workflows/ci.yml` per [ci-cd.md](./ci-cd.md)
- [ ] Mark A15 ✅ on [sign-off.md](../program/sign-off.md)

---

## Related Documents

- [setup.md](./setup.md)
- [build.md](./build.md)
- [upstream-sync.md](../architecture/upstream-sync.md)
