# Settings & Configuration Schema

EcoSystems IDE configuration keys for AI and platform features.

**Namespace prefix:** `ecosystems.*` (avoids collision with VS Code defaults)  
**Last updated:** 2026-05-30

---

## 1. Configuration Layers

| Layer | File | Precedence |
|-------|------|------------|
| Default | Product defaults in code | Lowest |
| User | `%APPDATA%/ecosystems-ide/User/settings.json` | Medium |
| Workspace | `.vscode/settings.json` or `.ecosystems/settings.json` | Highest |

Phase 0: user settings only for AI keys/models.

---

## 2. AI Settings (Phase 0)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ecosystems.ai.enabled` | boolean | `true` | Master switch for all AI features |
| `ecosystems.ai.provider` | enum | `"openai"` | `openai` \| `custom` \| `none` |
| `ecosystems.ai.provider.baseUrl` | string | `""` | Custom OpenAI-compatible endpoint |
| `ecosystems.ai.openai.keyConfigured` | boolean | `false` | Read-only; set by keychain service |
| `ecosystems.ai.chat.model` | string | `"gpt-4o-mini"` | Chat model ID |
| `ecosystems.ai.inline.model` | string | `"gpt-4o-mini"` | Inline completion model |
| `ecosystems.ai.inline.enabled` | boolean | `true` | Toggle ghost text |
| `ecosystems.ai.inline.debounceMs` | number | `300` | Delay before request |
| `ecosystems.ai.chat.temperature` | number | `0.2` | 0–2 |
| `ecosystems.ai.inline.maxTokens` | number | `256` | Max completion length |
| `ecosystems.ai.chat.maxTokens` | number | `4096` | Max response length |
| `ecosystems.ai.context.maxTokens` | number | `8192` | Context budget cap |
| `ecosystems.ai.context.maxFileBytes` | number | `102400` | 100 KB attach limit |

### Enum: `ecosystems.ai.provider`

```json
{
  "enum": ["openai", "custom", "none"],
  "enumDescriptions": [
    "OpenAI or OpenAI-compatible API",
    "Custom base URL with API key",
    "Disable cloud providers"
  ]
}
```

---

## 3. Settings NOT in JSON (Keychain)

| Secret | Keychain account |
|--------|------------------|
| OpenAI API key | `ai.provider.openai.apiKey` |
| Custom provider key | `ai.provider.custom.apiKey` |

See [secrets-and-keychain.md](../security/secrets-and-keychain.md).

---

## 4. UI Registration (VS Code pattern)

```typescript
configurationRegistry.registerConfiguration({
  id: 'ecosystemsAi',
  title: 'EcoSystems AI',
  properties: {
    'ecosystems.ai.enabled': {
      type: 'boolean',
      default: true,
      description: 'Enable AI features. When off, no data is sent to LLM providers.'
    },
    // ...
  }
});
```

Settings UI section: **Settings → EcoSystems AI**

---

## 5. Phase 1 Additions (Planned)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ecosystems.ai.context.includeDiagnostics` | boolean | `true` | Add errors to chat context |
| `ecosystems.ai.context.includeGitDiff` | boolean | `false` | Add git diff |
| `ecosystems.ai.rules.path` | string | `".ide/rules"` | Project rules file |
| `ecosystems.ai.privacy.warnSecretFiles` | boolean | `true` | Warn on `.env` attach |
| `ecosystems.ai.privacy.blockSecretFiles` | boolean | `true` | Block sending secrets |
| `ecosystems.ai.audit.logEnabled` | boolean | `false` | Local prompt audit log |

---

## 6. Phase 2 Additions (Planned)

| Key | Type | Default |
|-----|------|---------|
| `ecosystems.ai.provider` | + `"ollama"` | |
| `ecosystems.ai.ollama.baseUrl` | string | `"http://localhost:11434"` |
| `ecosystems.ai.agent.autoApply` | boolean | `false` |
| `ecosystems.ai.agent.approveTerminal` | boolean | `true` |

---

## 7. Workspace Trust Interaction

When VS Code **Restricted Mode** (untrusted workspace):

- `ecosystems.ai.enabled` forced `false` until user trusts workspace
- Show banner: "AI disabled in untrusted workspace"

---

## 8. Migration

No migrations in Phase 0. Future:

```typescript
// Example: rename key
migrate: { 'ecosystems.ai.model': 'ecosystems.ai.chat.model' }
```

---

## 9. JSON Schema Export

Publish `schemas/settings.schema.json` for IDE validation (Phase 1).

---

## 10. Related Documents

- [model-router.md](./model-router.md)
- [prompt-data-policy.md](../security/prompt-data-policy.md)
