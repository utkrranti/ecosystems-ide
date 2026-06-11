# Settings & Configuration Schema

Altus IDE configuration keys for AI and platform features.

**Namespace prefix:** `ecosystems.*` (avoids collision with VS Code defaults)  
**Last updated:** 2026-05-31  
**Auth:** Inbuilt via Altus AI Gateway ([ADR-011](../05-architectural-decisions.md#adr-011-inbuilt-ai-via-ecosystems-gateway)) — no user LLM API keys

---

## 1. Configuration Layers

| Layer | File | Precedence |
|-------|------|------------|
| Default | Product defaults in code | Lowest |
| User | `%APPDATA%/ecosystems-ide/User/settings.json` | Medium |
| Workspace | `.vscode/settings.json` or `.ecosystems/settings.json` | Highest |

Phase 0: user settings for AI models and gateway URL; **session token** in keychain (not provider API keys).

---

## 2. AI Settings (Phase 0)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ecosystems.ai.enabled` | boolean | `true` | Master switch for all AI features |
| `ecosystems.ai.provider` | enum | `"ecosystems"` | `ecosystems` \| `none` |
| `ecosystems.ai.gateway.baseUrl` | string | `https://api.ecosystems.dev/v1` | Gateway URL (override for local dev) |
| `ecosystems.ai.session.configured` | boolean | `false` | Read-only; true when signed in |
| `ecosystems.ai.chat.model` | string | `"gpt-4o-mini"` | Chat model ID (from gateway catalog) |
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
  "enum": ["ecosystems", "none"],
  "enumDescriptions": [
    "Altus AI Gateway (inbuilt; sign in required)",
    "Disable cloud AI"
  ]
}
```

---

## 3. Settings NOT in JSON (Keychain)

| Secret | Keychain account |
|--------|------------------|
| EcoSystems session token | `ai.ecosystems.sessionToken` |
| Refresh token (if used) | `ai.ecosystems.refreshToken` |

**Not stored:** OpenAI/Anthropic `sk-...` keys (gateway holds upstream keys server-side).

See [secrets-and-keychain.md](../security/secrets-and-keychain.md).

---

## 4. UI Registration (VS Code pattern)

```typescript
configurationRegistry.registerConfiguration({
  id: 'ecosystemsAi',
  title: 'Altus AI',
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

Settings UI section: **Settings → Altus AI**

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
