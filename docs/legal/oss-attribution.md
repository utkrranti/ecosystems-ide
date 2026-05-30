# OSS Licenses & Third-Party Attribution

Legal requirements for EcoSystems IDE as a **Code-OSS (MIT) fork**.

**Last updated:** 2026-05-30  
**Status:** Required before public distribution

---

## 1. Summary

EcoSystems IDE is built on **Visual Studio Code — Open Source (Code-OSS)**, licensed under the **MIT License** by Microsoft and contributors.

We must:

1. **Retain** upstream MIT license and copyright notices
2. **Ship** `ThirdPartyNotices.txt` (or equivalent) with the product
3. **Attribute** all bundled open-source components
4. **Not imply** Microsoft endorsement or VS Code trademark ownership

---

## 2. Primary License

### Code-OSS / EcoSystems IDE core

| Item | Value |
|------|-------|
| License | MIT |
| Upstream | https://github.com/microsoft/vscode/blob/main/LICENSE.txt |
| Copyright | Microsoft Corporation (original); EcoSystems contributors (modifications) |

### EcoSystems modifications

New files under `src/vs/platform/ecosystems/` and `src/vs/workbench/contrib/ecosystems/`:

```
Copyright (c) 2026 EcoSystems contributors
SPDX-License-Identifier: MIT
```

Place MIT header on new source files (match upstream VS Code file header style).

---

## 3. Required Files in Repository

| File | Purpose | Source |
|------|---------|--------|
| `LICENSE.txt` | Primary MIT license | Upstream + EcoSystems amendment note |
| `ThirdPartyNotices.txt` | All bundled OSS | Upstream (keep updated on sync) |
| `NOTICE.txt` | Optional consolidated notice | EcoSystems additions |

### LICENSE.txt structure

1. **Section 1:** Original Microsoft MIT license (verbatim)
2. **Section 2:** EcoSystems modifications notice:

```
EcoSystems IDE is a fork of Visual Studio Code - Open Source ("Code-OSS").
Modifications copyright (c) 2026 EcoSystems contributors.
Licensed under the MIT License.
```

**Do not remove** Microsoft copyright from upstream sections.

---

## 4. Third-Party Notices

Code-OSS ships hundreds of dependencies. **Always preserve** upstream `ThirdPartyNotices.txt` when merging.

On upstream sync:

1. Take Microsoft's updated `ThirdPartyNotices.txt`
2. Append EcoSystems-specific additions (if any new deps):

```
EcoSystems IDE Additional Components
------------------------------------
keytar - MIT - https://github.com/atom/node-keytar
```

Run license audit after adding dependencies:

```powershell
yarn licenses list --production
```

---

## 5. Key Dependencies (Reference)

| Component | License | Notes |
|-----------|---------|-------|
| Code-OSS / VS Code core | MIT | Base product |
| Electron | MIT | Runtime |
| Monaco Editor | MIT | Editor |
| node-pty | MIT | Terminal |
| keytar | MIT | Keychain |
| @vscode/ripgrep | Custom (see upstream) | Search |
| TypeScript | Apache-2.0 | Dev + runtime |

Full list: upstream `ThirdPartyNotices.txt` is authoritative.

---

## 6. Distribution Requirements

Every **installable build** must include:

- [ ] `LICENSE.txt` accessible (About dialog + install dir)
- [ ] `ThirdPartyNotices.txt` in install directory
- [ ] About dialog → **Open Source Components** link (inherited from Code-OSS)

Verify in About dialog after fork:

**Help → About EcoSystems IDE → (third party link)**

---

## 7. What We Must Not Do

| Prohibited | Reason |
|------------|--------|
| Remove MIT license from upstream files | License violation |
| Strip copyright headers on sync | License violation |
| Claim original authorship of Code-OSS | Misrepresentation |
| Use "Visual Studio Code" as product name | Trademark |
| Use Microsoft / VS Code logos | Trademark |

See [branding.md](./branding.md).

---

## 8. Apache, GPL, and Other Licenses

Most VS Code deps are MIT/BSD/Apache-2.0. If adding a dependency:

| License | Policy |
|---------|--------|
| MIT, BSD, Apache-2.0 | ✅ Allowed |
| ISC | ✅ Allowed |
| LGPL | ⚠️ Legal review required |
| GPL (copyleft) | ❌ Avoid in core unless legal approves |
| Proprietary | ❌ Not in core |

Document new deps in PR description and update notices if required.

---

## 9. Upstream Sync Checklist (Legal)

On each upstream merge:

- [ ] `LICENSE.txt` merged correctly (Microsoft section intact)
- [ ] `ThirdPartyNotices.txt` updated from upstream
- [ ] EcoSystems NOTICE section still present
- [ ] No proprietary code accidentally merged

---

## 10. Contributor Agreement

Phase 0: contributors agree by PR that contributions are MIT-licensed (state in [contributing.md](../dev/contributing.md)).

Phase 1+: consider CLA if team grows.

---

## 11. Related Documents

- [branding.md](./branding.md)
- [upstream-sync.md](../architecture/upstream-sync.md)
- [sign-off.md](../program/sign-off.md) — Gate A A18
