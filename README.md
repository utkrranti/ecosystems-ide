# EcoSystems IDE

A VS Code–class desktop editor with **native AI** — inline completion, project-aware chat, and (future) guarded agent workflows.

## Status

**Phase:** Planning complete for Phase 0 — implementation not started.

## Documentation

All planning lives in [`docs/`](./docs/README.md). **Start with the [reading sequence](./docs/READING-SEQUENCE.md).**

| Doc | Description |
|-----|-------------|
| [Product vision](./docs/01-product-vision.md) | North star, personas, pillars |
| [Tech stack](./docs/02-tech-stack.md) | Electron, Code-OSS, AI layer |
| [Architecture](./docs/03-solution-architecture.md) | System design |
| [Roadmap](./docs/04-roadmap.md) | Phase 0–3 plan |
| [ADRs](./docs/05-architectural-decisions.md) | Architectural decisions |
| [Documentation checklist](./docs/DOCUMENTATION-CHECKLIST.md) | Pre-implementation gates |
| [Reading sequence](./docs/READING-SEQUENCE.md) | **Read docs in this order** |

**Phase 0 scope:** [PRD v1](./docs/product/PRD-v1-phase0.md)

## Repository strategy

Single monorepo for the desktop product — see **ADR-010** in [05-architectural-decisions.md](./docs/05-architectural-decisions.md).

## Stack (Summary)

- **Base:** Code-OSS fork (MIT)
- **Shell:** Electron + TypeScript
- **AI:** Core platform services (inline + chat in Phase 0)
- **Provider:** User-supplied OpenAI-compatible API key

## Gate before coding

All **29 must-have docs** are written. See [docs/program/sign-off.md](./docs/program/sign-off.md) Gate A and [fork-spike-checklist.md](./docs/dev/fork-spike-checklist.md).

## License

MIT (inherited from Code-OSS). See [docs/legal/oss-attribution.md](./docs/legal/oss-attribution.md).
