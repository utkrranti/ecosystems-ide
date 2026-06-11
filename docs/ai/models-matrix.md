# Supported Models Matrix — Phase 0

Models available in Altus IDE Phase 0 via **inbuilt AI** (Altus AI Gateway + user session/license).

**Provider:** Altus AI Gateway ([ADR-011](../05-architectural-decisions.md#adr-011-inbuilt-ai-via-ecosystems-gateway))  
**Last updated:** 2026-05-31

---

## 1. Phase 0 Scope

| Capability | Supported | Notes |
|------------|-----------|-------|
| Cloud chat | ✅ | Streaming via gateway |
| Inline completion | ✅ | Via gateway |
| User BYOK / paste API key | ❌ | Not offered (consumer) |
| Bundled / included access | ✅ | By Altus AI plan tier |
| Local (Ollama) | ❌ | Phase 2 (via gateway route) |
| Anthropic (direct in IDE) | ❌ | Phase 1 (gateway upstream only) |

---

## 2. How users get models

Users do **not** buy API keys from OpenAI. They:

1. **Sign in** to Altus AI (or activate a license).
2. Use models **included in their plan** (free / pro / team).
3. Pick a model in **Settings → Altus AI** from the gateway catalog.

Altus AI pays upstream providers and meters usage on the gateway.

---

## 3. Gateway model catalog (Phase 0)

Curated models exposed by `GET /ai/models`:

| Model ID | Use | Tier | Phase 0 | Notes |
|----------|-----|------|---------|-------|
| `gpt-4o-mini` | Chat + inline default | free / pro | ✅ **Default** | Best cost/latency |
| `gpt-4o` | Chat (quality) | pro | ✅ | Higher quality |
| `gpt-4-turbo` | Chat | pro | ⚠️ | Legacy; prefer 4o |

Gateway may add/remove models without IDE release (server-driven catalog).

### Not supported Phase 0

| Model / API | Reason |
|-------------|--------|
| `o1`, `o1-mini`, `o3` | Reasoning API differs; no streaming parity |
| DALL·E, Whisper, TTS | Out of scope |
| Arbitrary third-party endpoints | No BYOK in IDE |

---

## 4. Default configuration (IDE settings)

| Setting | Default value |
|---------|---------------|
| `ecosystems.ai.provider` | `ecosystems` |
| `ecosystems.ai.gateway.baseUrl` | production URL (override for dev) |
| `ecosystems.ai.chat.model` | `gpt-4o-mini` |
| `ecosystems.ai.inline.model` | `gpt-4o-mini` |
| `ecosystems.ai.chat.maxTokens` | `4096` |
| `ecosystems.ai.inline.maxTokens` | `256` |
| `ecosystems.ai.chat.temperature` | `0.2` |
| Inline temperature | `0.0` (hardcoded in provider) |

---

## 5. Model selection UI

Settings dropdown populated from **gateway model list** (filtered by tier).

- Signed out → prompt to sign in; no model picker
- Signed in → curated list for user's plan
- No "Custom model ID" or "Custom base URL" in consumer builds

---

## 6. Feature × Model Compatibility

| Feature | Required capability | Min model |
|---------|---------------------|-----------|
| Chat stream | Gateway SSE | Any chat model in catalog |
| Inline ghost text | Gateway stream | Instruction-following chat model |
| `@currentFile` | Same | Context ≥ 8k tokens effective |

---

## 7. Billing & rate limits

| Handling | Behavior |
|----------|----------|
| HTTP 429 | Retry twice; show "rate limited" |
| HTTP 401 | Show "Sign in to Altus AI" |
| HTTP 402 / quota | Show upgrade / wait message |
| Context too long | Truncate per [ai-context-pipeline.md](../architecture/ai-context-pipeline.md) |

Altus AI bills the user (subscription/credits). Upstream provider billing is internal to the gateway.

---

## 8. Local development

| Component | Dev setup |
|-----------|-----------|
| Gateway | Run locally (`http://localhost:8080`); team upstream keys on **server only** |
| IDE | `ecosystems.ai.gateway.baseUrl` → localhost |
| Auth | Dev session token or mock auth endpoint |

IDE never stores OpenAI `sk-...` keys even in dev.

---

## 9. Testing matrix (QA)

| # | Scenario | Pass |
|---|----------|------|
| 1 | Signed in; chat stream `gpt-4o-mini` | ☐ |
| 2 | Signed in; inline `gpt-4o-mini` | ☐ |
| 3 | Signed out; AI disabled with clear message | ☐ |
| 4 | Quota exceeded; upgrade prompt | ☐ |
| 5 | Pro user; `gpt-4o` available | ☐ |

---

## 10. Roadmap

| Phase | Addition |
|-------|----------|
| 1 | Anthropic via gateway (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) |
| 2 | Local models via gateway Ollama route |
| 3+ | Enterprise BYOK tier (optional; not default) |

---

## 11. Related Documents

- [model-router.md](../architecture/model-router.md)
- [settings-schema.md](../architecture/settings-schema.md)
- [prompt-templates.md](./prompt-templates.md)
- ADR-011 in [05-architectural-decisions.md](../05-architectural-decisions.md)
