# CI/CD Pipeline Design

Continuous integration and delivery for EcoSystems IDE.

**Phase:** 0  
**Platform:** GitHub Actions  
**Last updated:** 2026-05-30

---

## 1. Goals

| Goal | Phase 0 |
|------|---------|
| Every PR compiles | ✅ |
| EcoSystems unit tests run | ✅ |
| E2E smoke (mock AI) | ✅ |
| Windows package artifact | ✅ (manual or workflow dispatch) |
| Code signing | ❌ Phase 1 |
| Auto-publish to users | ❌ Phase 1 |

---

## 2. Pipeline Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Push / PR   │────►│  CI (build)  │────►│ Merge OK    │
│ to develop  │     │  test        │     │             │
└─────────────┘     └──────────────┘     └─────────────┘

┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Tag v0.x.x  │────►│  Release job │────►│ GitHub      │
│ on main     │     │  package Win │     │ Releases    │
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## 3. Workflows

| Workflow | Trigger | Runner | Purpose |
|----------|---------|--------|---------|
| `ci.yml` | PR → `develop`, push `develop` | `windows-latest` | Compile + test |
| `ci-linux.yml` | PR (optional) | `ubuntu-latest` | Compile smoke |
| `release.yml` | Tag `v*` on `main` | `windows-latest` | Build installer |
| `docs.yml` | PR touching `docs/**` only | `ubuntu-latest` | Markdown link check (optional) |

Phase 0: **`ci.yml` required**; others optional.

---

## 4. CI Job — `ci.yml`

### Triggers

```yaml
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]
```

### Steps

| Step | Command | Fail if |
|------|---------|---------|
| Checkout | `actions/checkout@v4` | — |
| Setup Node 20 | `actions/setup-node@v4` | — |
| Setup Python 3.11 | `actions/setup-python@v5` | — |
| Install deps | `yarn --frozen-lockfile` | install fails |
| Compile | `yarn compile` | compile errors |
| Unit tests | `yarn test --grep ecosystems` | test failures |
| E2E smoke | `yarn playwright test test/e2e/ecosystems` | smoke fails |

### Environment

```yaml
env:
  ECOSYSTEMS_TEST: '1'          # mock LLM — no API key in CI
  NODE_OPTIONS: '--max-old-space-size=8192'
```

### Secrets (CI)

| Secret | Required Phase 0 | Use |
|--------|------------------|-----|
| `OPENAI_API_KEY` | **No** | Mock provider only in CI |
| `CODECOV_TOKEN` | No | Optional coverage Phase 1 |

**Never** add API keys to GitHub Actions for Phase 0 CI.

---

## 5. Example `ci.yml` (Reference)

Create at `.github/workflows/ci.yml` after fork spike:

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

jobs:
  build-and-test:
    runs-on: windows-latest
    timeout-minutes: 60

    env:
      ECOSYSTEMS_TEST: '1'
      NODE_OPTIONS: '--max-old-space-size=8192'

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: yarn --frozen-lockfile

      - name: Compile
        run: yarn compile

      - name: Unit tests (ecosystems)
        run: yarn test --grep ecosystems

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: E2E smoke
        run: yarn playwright test test/e2e/ecosystems
```

Adjust after upstream fork — paths and scripts inherit from Code-OSS.

---

## 6. Release Job — `release.yml` (Phase 0)

### Trigger

```yaml
on:
  push:
    tags:
      - 'v*'
```

### Steps

1. Checkout tag
2. `yarn compile`
3. `yarn gulp vscode-win32-x64-min` (or project packaging script)
4. Upload `.exe` / zip to GitHub Releases via `softprops/action-gh-release`

### Phase 0 limitations

- **Unsigned** Windows binary — document in release notes
- No auto-update channel until [code-signing.md](./code-signing.md) (Phase 1)

---

## 7. Branch Protection Rules

Configure on GitHub for `develop` and `main`:

| Rule | `develop` | `main` |
|------|-----------|--------|
| Require PR | ✅ | ✅ |
| Require CI pass | ✅ | ✅ |
| Require 1 review | ✅ | 2 reviews |
| No force push | ✅ | ✅ |
| Include administrators | Optional | ✅ |

---

## 8. PR Checks Summary

Every PR shows:

| Check | Required |
|-------|----------|
| CI / build-and-test | ✅ |
| No secrets in diff (optional: gitleaks) | Recommended |

---

## 9. Local CI Parity

Before push, run:

```powershell
yarn compile
yarn test --grep ecosystems
$env:ECOSYSTEMS_TEST = "1"
yarn playwright test test/e2e/ecosystems
```

Matches CI job on `windows-latest`.

---

## 10. Caching

| Cache | Key |
|-------|-----|
| yarn | `hashFiles('yarn.lock')` |
| Playwright browsers | `playwright-version` in lockfile |

First CI run ~45–60 min; cached runs ~15–25 min (compile-heavy).

---

## 11. Failure Notifications

Phase 0: GitHub default (email on failed push to `develop`).

Phase 1: optional Slack webhook on `main` failure.

---

## 12. Upstream Sync CI

On `sync/upstream-*` PRs, run **full** test suite:

```powershell
yarn test   # not just ecosystems grep
```

Plus manual smoke checklist in [upstream-sync.md](../architecture/upstream-sync.md).

---

## 13. Related Documents

- [build.md](./build.md)
- [testing-strategy.md](../quality/testing-strategy.md)
- [contributing.md](./contributing.md)
- [release-strategy.md](./release-strategy.md) *(Phase 1)*
