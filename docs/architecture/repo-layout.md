# Repository Layout & Module Boundaries

Target structure for the EcoSystems IDE monorepo after Code-OSS fork integration.

**Last updated:** 2026-05-30

---

## 1. Top-Level Layout

```
ecosystems-ide/
├── .github/
│   └── workflows/              # CI: build, test, package
├── docs/                       # All planning & ADRs (this files)
├── resources/                  # Branding: icons, license banners
│   ├── icons/
│   └── linux/
├── scripts/
│   ├── fork/                   # Initial fork setup
│   ├── sync-upstream.sh        # Merge Code-OSS releases
│   ├── brand.sh                # Apply product.json patches
│   └── package-win.ps1
├── build/                      # Inherited VS Code build configs (minimal patches)
├── src/
│   ├── vs/                     # Code-OSS core (upstream — minimize direct edits)
│   │   ├── workbench/
│   │   ├── platform/
│   │   ├── editor/
│   │   └── ...
│   └── vs/platform/ecosystems/ # ★ All EcoSystems-first-party code
│       ├── ai/
│       │   ├── common/         # Shared types, constants
│       │   ├── context/        # Context assembly (Phase 1 expands)
│       │   ├── inline/         # Inline completion provider
│       │   ├── router/         # Model router + providers
│       │   ├── secrets/        # Keychain wrapper
│       │   └── agent/          # Phase 2 — stub in Phase 0
│       └── browser/            # Webview UI for chat
├── extensions/
│   └── ecosystems-welcome/     # First-run + API key prompt (optional)
├── test/
│   ├── unit/ecosystems/
│   └── e2e/ecosystems/
├── product.json                # App name, IDs, update URL (patched)
├── package.json                # Root yarn workspace (inherited)
└── README.md
```

---

## 2. Rule: Where to Put Code

| Change type | Location | Rule |
|-------------|----------|------|
| AI business logic | `src/vs/platform/ecosystems/ai/` | **Always here first** |
| Workbench registration (commands, views) | `src/vs/workbench/contrib/ecosystems/` | Thin wiring only |
| Webview UI | `src/vs/platform/ecosystems/browser/` | No Node APIs in webview |
| Upstream bugfix | `src/vs/**` elsewhere | Prefer upstream PR; else document |
| Branding | `resources/` + `product.json` | Scripted patches |
| Docs | `docs/` | Never in `src/` |

**Anti-pattern:** Scattering `// ecosystems` comments across random `src/vs/workbench/**` files. Centralize contrib registration.

---

## 3. Module Boundaries

```
┌─────────────────────────────────────────────────────────┐
│ workbench/contrib/ecosystems/                           │
│   - Registers views, commands, keybindings              │
│   - Delegates to platform services                      │
└────────────────────────┬────────────────────────────────┘
                         │ DI (InstantiationService)
┌────────────────────────▼────────────────────────────────┐
│ platform/ecosystems/ai/                                 │
│   ├── IAiService          (facade)                      │
│   ├── IModelRouter        (provider selection)          │
│   ├── IInlineAiService    (completions)                 │
│   ├── IChatAiService      (sidebar chat)                │
│   └── ISecretsService     (keychain)                    │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   OpenAiProvider   ContextBuilder   KeytarSecrets
```

### Dependency rules

| Module | May import | Must not import |
|--------|------------|-----------------|
| `browser/` (webview) | VS Code webview API, message protocol | `keytar`, `fs`, model router |
| `ai/router/` | `secrets/`, HTTP client | workbench UI |
| `ai/inline/` | `router/`, `context/` | webview DOM |
| `workbench/contrib/` | platform services via DI | provider HTTP directly |

**Webview isolation:** Chat webview talks to main thread via `postMessage` only. API keys never enter webview.

---

## 4. Key Files (Phase 0)

| File | Purpose |
|------|---------|
| `product.json` | `nameShort`, `nameLong`, `applicationName`, `dataFolderName` |
| `src/vs/platform/ecosystems/ai/common/aiService.ts` | Service interfaces |
| `src/vs/platform/ecosystems/ai/router/modelRouter.ts` | Provider dispatch |
| `src/vs/platform/ecosystems/ai/router/openaiProvider.ts` | OpenAI-compatible client |
| `src/vs/platform/ecosystems/ai/inline/inlineCompletionProvider.ts` | Monaco registration |
| `src/vs/platform/ecosystems/ai/secrets/keychainService.ts` | keytar wrapper |
| `src/vs/platform/ecosystems/browser/chatWebview.ts` | Sidebar panel |
| `src/vs/workbench/contrib/ecosystems/browser/ecosystems.contribution.ts` | Entry: register all |

---

## 5. Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Service interfaces | `I{Name}Service` | `IModelRouterService` |
| Implementations | `{Name}Service` | `ModelRouterService` |
| Settings keys | `ecosystems.ai.*` | `ecosystems.ai.enabled` |
| Commands | `ecosystems.ai.*` | `ecosystems.ai.focusChat` |
| View IDs | `workbench.view.ecosystems.ai.chat` | |
| Context keys | `ecosystemsAiEnabled` | |

Use `ecosystems` prefix to avoid collision with upstream VS Code settings.

---

## 6. product.json (Branding)

Key fields to patch from Code-OSS defaults:

```json
{
  "nameShort": "EcoSystems IDE",
  "nameLong": "EcoSystems IDE",
  "applicationName": "ecosystems-ide",
  "dataFolderName": ".ecosystems-ide",
  "win32MutexName": "ecosystemside",
  "licenseName": "MIT",
  "licenseUrl": "https://github.com/utkrranti/ecosystems-ide/blob/main/LICENSE.txt",
  "reportIssueUrl": "https://github.com/utkrranti/ecosystems-ide/issues"
}
```

---

## 7. Test Layout

```
test/
├── unit/ecosystems/
│   ├── modelRouter.test.ts
│   ├── keychainService.test.ts
│   └── contextBuilder.test.ts
└── e2e/ecosystems/
    ├── chat-smoke.test.ts
    └── inline-smoke.test.ts
```

Unit tests colocated optional for pure logic; prefer `test/unit/ecosystems/` for CI discovery.

---

## 8. Fork Integration Strategy

**Phase 0 approach:** Single repo containing full Code-OSS tree (not submodule initially).

**Rationale:** Simplest clone-and-build for small team. Migrate to subtree/submodule when upstream sync pain exceeds ~4 hours/month.

See [upstream-sync.md](./upstream-sync.md).

---

## 9. What Not to Commit

```
.env
*.pem
**/secrets.json
out/
node_modules/
.vscode-test/
*.vsix (except release artifacts in GitHub Releases)
```

`.gitignore` inherited from upstream + EcoSystems additions in fork setup script.

---

## 10. Related Documents

- [upstream-sync.md](./upstream-sync.md)
- [ai-context-pipeline.md](./ai-context-pipeline.md)
- [model-router.md](./model-router.md)
- [settings-schema.md](./settings-schema.md)
