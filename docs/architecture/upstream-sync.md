# Code-OSS Fork & Upstream Sync Procedure

How to create the initial fork and keep EcoSystems IDE aligned with [microsoft/vscode](https://github.com/microsoft/vscode) (Code-OSS).

**Last updated:** 2026-05-30

---

## 1. Initial Fork Setup (One-Time)

### Prerequisites

- Node.js 20.x
- Python 3.11+
- Visual Studio Build Tools (Windows) / Xcode CLT (macOS)
- Git 2.40+
- ~10 GB disk space
- Yarn (`corepack enable`)

### Steps

```powershell
# 1. Clone upstream (use a stable tag, not main)
git clone --depth 1 --branch 1.96.2 https://github.com/microsoft/vscode.git ecosystems-ide
cd ecosystems-ide

# 2. Re-point origin to EcoSystems repo (after creating empty GitHub repo)
git remote rename origin vscode-upstream
git remote add origin https://github.com/ecosystems/ide.git

# 3. Apply branding
./scripts/brand.ps1   # patches product.json, icons, LICENSE banner

# 4. Install & build
yarn
yarn watch   # first compile ~15-25 min

# 5. Verify vanilla fork runs before AI changes
# Launch via Run and Debug → "Launch VS Code" (rename config later)
```

### brand.ps1 responsibilities

- Patch `product.json` (see [repo-layout.md](./repo-layout.md))
- Replace `resources/win32/code.ico` (and darwin/linux icons)
- Update `LICENSE.txt` with third-party notices (do not remove MIT attribution)
- Add `src/vs/workbench/contrib/ecosystems/` scaffold (empty contribution)

**Checkpoint:** App launches as "EcoSystems IDE" with no AI — commit as `chore: initial Code-OSS fork at 1.96.2`.

---

## 2. Remotes Layout

```
origin          → github.com/ecosystems/ide (your repo)
vscode-upstream → github.com/microsoft/vscode (read-only)
```

Optional mirror for faster fetch:

```
git remote add vscode-upstream https://github.com/microsoft/vscode.git
```

---

## 3. Sync Cadence

| Release type | Action |
|--------------|--------|
| **Security patch** (upstream) | Merge within 1 week |
| **Monthly stable** | Merge within 2 weeks of tag |
| **Insiders** | Do not track — stay on stable tags |

Assign **one owner** per month for upstream merge (on-call rotation).

---

## 4. Monthly Sync Procedure

```powershell
# 0. Ensure clean working tree
git status

# 1. Fetch upstream tag
git fetch vscode-upstream tag 1.97.0 --no-tags
# Or: git fetch vscode-upstream main

# 2. Create sync branch
git checkout -b sync/upstream-1.97.0

# 3. Merge upstream (prefer tag over main)
git merge 1.97.0 -m "chore: merge vscode 1.97.0"

# 4. Resolve conflicts (see §5)
# 5. Full build + smoke test
yarn
yarn compile
yarn test

# 6. Manual smoke
#    - Open folder, terminal, git, TypeScript LSP
#    - AI chat + inline completion

# 7. PR to main with label upstream-sync
```

**Do not merge broken sync to `main`.** Revert or fix forward on sync branch.

---

## 5. Conflict Hotspots

Expect conflicts most often in:

| Path | Why | Resolution strategy |
|------|-----|---------------------|
| `product.json` | Branding | Keep EcoSystems values |
| `package.json` | Version bumps | Take upstream deps; re-add ecosystems scripts |
| `src/vs/workbench/workbench.desktop.main.ts` | Contribution imports | Keep both upstream + ecosystems import |
| `src/vs/platform/*` | Occasional AI touch points | Prefer upstream; re-apply thin ecosystems hooks |
| `yarn.lock` | Always | Take upstream; `yarn` to regenerate |
| `resources/**` | Icons | Keep EcoSystems icons |

**Golden rule:** EcoSystems logic lives in `src/vs/platform/ecosystems/**` and `src/vs/workbench/contrib/ecosystems/**` — conflicts there are rare and intentional.

---

## 6. Files Safe to Overwrite from Upstream

Always take upstream version (then re-run branding script if needed):

- `build/**`
- `extensions/**` (except `extensions/ecosystems-*`)
- `src/vs/base/**`, `src/vs/editor/**` (unless explicit ecosystems patch)
- `.github/workflows/` (merge carefully — keep EcoSystems CI jobs)

---

## 7. Files Never Blindly Overwrite

| File | Action |
|------|--------|
| `product.json` | Merge manually |
| `src/vs/platform/ecosystems/**` | Ours |
| `src/vs/workbench/contrib/ecosystems/**` | Ours |
| `docs/**` | Ours |
| `scripts/fork/**`, `scripts/brand.*` | Ours |

---

## 8. Patch Discipline

### Prefer

- New files under `ecosystems/` paths
- Dependency injection registration in single contribution file
- Configuration via `ecosystems.ai.*` settings

### Avoid

- Editing `src/vs/editor/**` core for AI features
- Copy-pasting large upstream files into ecosystems tree
- `#ifdef` style comments scattered in upstream files

### When upstream edit is unavoidable

Document in `docs/architecture/upstream-patches.md`:

```markdown
## Patch: workbench.desktop.main.ts
- Reason: register ecosystems contribution
- Upstream file: src/vs/workbench/workbench.desktop.main.ts
- Re-apply on sync: yes (1 line import)
```

---

## 9. Version Mapping

| EcoSystems IDE | Code-OSS base | Notes |
|--------------|---------------|-------|
| 0.1.0 | 1.96.x | Phase 0 start |
| 0.2.0 | 1.97.x | Phase 1 target |

EcoSystems semver is **independent** of VS Code patch version. Record base tag in `docs/architecture/upstream-patches.md` and release notes.

---

## 10. CI Requirements for Sync PRs

- [ ] `yarn compile` green
- [ ] Unit tests pass
- [ ] E2E smoke: launch, open file, AI chat ping
- [ ] No duplicate LICENSE violations
- [ ] `product.json` still shows EcoSystems branding

---

## 11. Rollback

If sync lands with regressions:

```powershell
git revert -m 1 <merge-commit-sha>
git push origin main
```

File incident in `docs/program/risk-register.md`.

---

## 12. Legal / Attribution

- Keep `ThirdPartyNotices.txt` from upstream; append EcoSystems additions
- Do not use Microsoft or VS Code logos/trademarks in marketing
- About dialog must show OSS components list (inherited)

See `docs/legal/oss-attribution.md` (to be written before public release).

---

## 13. Related Documents

- [repo-layout.md](./repo-layout.md)
- [05-architectural-decisions.md](../05-architectural-decisions.md) ADR-001
