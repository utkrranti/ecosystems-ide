# Contributing & Branch Strategy

Git workflow, branches, and PR rules for EcoSystems IDE.

**Last updated:** 2026-05-30

---

## 1. Repository

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `github.com/ecosystems/ide` | EcoSystems fork (push) |
| `vscode-upstream` | `github.com/microsoft/vscode` | Upstream (fetch only) |

---

## 2. Branch Strategy

```
main          ← production-ready; tagged releases only
develop       ← integration branch; default for PRs
feature/*     ← new features
fix/*         ← bug fixes
sync/*        ← upstream merges
docs/*        ← documentation-only
spike/*       ← time-boxed experiments (may not merge)
```

### Rules

| Branch | Merge from | Merge to | Protection |
|--------|------------|----------|------------|
| `main` | `develop` (release PR only) | — | Required review + CI |
| `develop` | feature/fix/docs PRs | `main` at release | Required CI |
| `sync/upstream-*` | upstream tag | `develop` | Review + full smoke |

**Default clone branch:** `develop`

---

## 3. Commit Messages

Follow conventional style (aligned with upstream VS Code where practical):

```
<type>(<scope>): <short description>

[optional body]
```

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Build, deps, branding |
| `refactor` | Code change, no behavior change |
| `test` | Tests |
| `sync` | Upstream merge |

**Scopes (EcoSystems):** `ai`, `chat`, `inline`, `router`, `secrets`, `branding`, `docs`

Examples:

```
feat(ai): add OpenAI streaming chat provider
fix(secrets): redact api key from error logs
sync: merge vscode 1.97.0
docs(dev): add setup guide for Windows
```

---

## 4. Pull Request Process

1. Branch from `develop`: `feature/ai-chat-webview`
2. Keep PRs focused (< 400 lines diff when possible)
3. Fill PR template: summary, test plan, screenshots for UI
4. CI must pass: `yarn compile` + `yarn test`
5. One approval required for `develop`; two for `main`
6. Squash merge preferred for features; merge commit for upstream sync

### PR checklist (author)

- [ ] No API keys, `.env`, or secrets in diff
- [ ] EcoSystems code under `src/vs/platform/ecosystems/` or `contrib/ecosystems/`
- [ ] Unit tests for service logic where applicable
- [ ] Docs updated if behavior or setup changed

---

## 5. Code Organization

See [repo-layout.md](../architecture/repo-layout.md).

**Do not** scatter AI logic across upstream files. Register via:

- `src/vs/workbench/contrib/ecosystems/browser/ecosystems.contribution.ts`

---

## 6. Upstream Merges

Only on `sync/upstream-X.Y.Z` branches. Never merge upstream directly to `main`.

Procedure: [upstream-sync.md](../architecture/upstream-sync.md)

---

## 7. Releases

| Branch | Tag | Example |
|--------|-----|---------|
| `main` | `v0.1.0` | Phase 0 release |

Release PR: `develop` → `main` with release notes.

---

## 8. Fork Setup (Maintainers)

```powershell
git clone git@github.com:ecosystems/ide.git
cd ide
git remote add vscode-upstream https://github.com/microsoft/vscode.git
git fetch vscode-upstream --tags
```

---

## 9. Getting Help

- Architecture: `docs/03-solution-architecture.md`
- Phase 0 scope: `docs/product/PRD-v1-phase0.md`
- Backlog: `docs/program/phase0-backlog.md`

---

## 10. Related Documents

- [setup.md](./setup.md)
- [build.md](./build.md)
- [sign-off.md](../program/sign-off.md) — Gate A item A14
