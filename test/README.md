# EcoSystems IDE — Test Quick Start

How to run tests locally. Full strategy: [../docs/quality/testing-strategy.md](../docs/quality/testing-strategy.md)

## Prerequisites

- Fork built per [setup.md](../docs/dev/setup.md)
- `yarn compile` completed

## Commands

```powershell
# Unit + integration (after fork exists)
yarn test --grep ecosystems

# Full upstream + ecosystems suite
yarn test

# E2E (Phase 0 — after Playwright configured)
$env:ECOSYSTEMS_TEST = "1"
yarn playwright test test/e2e/ecosystems
```

## Test modes

| Env var | Effect |
|---------|--------|
| `ECOSYSTEMS_TEST=1` | Use mock LLM — no cloud calls |
| `ECOSYSTEMS_LIVE_API_KEY=sk-...` | Optional manual live tests only |

## Debug webview (in-app browser)

1. Launch dev app (`scripts/code.bat`)
2. Open **EcoSystems AI** sidebar
3. Command palette → **Developer: Open Webview Developer Tools**
4. Inspect chat DOM and console

## Folders

| Path | Purpose |
|------|---------|
| `test/unit/ecosystems/` | Service unit tests |
| `test/integration/ecosystems/` | Webview protocol, inline |
| `test/e2e/ecosystems/` | Playwright smoke |

*Test files are added when implementation starts — this repo is docs-only until fork spike.*
