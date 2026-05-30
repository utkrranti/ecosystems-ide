# Supported Models Matrix — Phase 0

Models supported in EcoSystems IDE Phase 0 via **user-supplied API keys** (BYOK).

**Provider:** OpenAI-compatible API (ADR-009)  
**Last updated:** 2026-05-30

---

## 1. Phase 0 Scope

| Capability | Supported | Notes |
|------------|-----------|-------|
| Cloud chat | ✅ | Streaming |
| Inline completion | ✅ | Via chat completions API |
| Local (Ollama) | ❌ | Phase 2 |
| Anthropic native | ❌ | Phase 1 (separate adapter) |
| Bundled / included credits | ❌ | BYOK only |

---

## 2. Primary Provider — OpenAI

**Default base URL:** `https://api.openai.com/v1`

### Chat models (recommended)

| Model ID | Use | Context | Phase 0 | Notes |
|----------|-----|---------|---------|-------|
| `gpt-4o-mini` | Chat + inline default | 128k | ✅ **Default** | Best cost/latency for Phase 0 |
| `gpt-4o` | Chat (quality) | 128k | ✅ | Higher quality, higher cost |
| `gpt-4-turbo` | Chat | 128k | ✅ | Legacy; prefer 4o |
| `gpt-3.5-turbo` | Chat | 16k | ⚠️ | Supported but not recommended |

### Not supported Phase 0

| Model / API | Reason |
|-------------|--------|
| `o1`, `o1-mini`, `o3` | Reasoning API differs; no streaming parity |
| DALL·E, Whisper, TTS | Out of scope |
| Fine-tuned model IDs | User can type ID manually if compatible |

---

## 3. OpenAI-Compatible Endpoints

Works with same client if endpoint implements `/v1/chat/completions` + SSE:

| Service | Base URL example | Phase 0 |
|---------|------------------|---------|
| Azure OpenAI | `https://{resource}.openai.azure.com/...` | ✅ via custom URL |
| Groq | `https://api.groq.com/openai/v1` | ✅ |
| Together AI | `https://api.together.xyz/v1` | ✅ |
| LocalAI | `http://localhost:8080/v1` | ⚠️ Dev only |
| LiteLLM proxy | User-defined | ✅ |

**Settings:** `ecosystems.ai.provider` = `custom`, set `ecosystems.ai.provider.baseUrl`.

User must verify model IDs match their provider's catalog.

---

## 4. Default Configuration

| Setting | Default value |
|---------|---------------|
| `ecosystems.ai.chat.model` | `gpt-4o-mini` |
| `ecosystems.ai.inline.model` | `gpt-4o-mini` |
| `ecosystems.ai.chat.maxTokens` | `4096` |
| `ecosystems.ai.inline.maxTokens` | `256` |
| `ecosystems.ai.chat.temperature` | `0.2` |
| Inline temperature | `0.0` (hardcoded in provider) |

---

## 5. Model Selection UI

Settings dropdown shows **curated list** + "Custom model ID" text field.

**Curated Phase 0 list:**

1. gpt-4o-mini
2. gpt-4o
3. gpt-4-turbo
4. Custom…

`listModels()` from API may populate suggestions in Phase 1.

---

## 6. Feature × Model Compatibility

| Feature | Required API | Min model capability |
|---------|--------------|----------------------|
| Chat stream | `chat.completions` + stream | Any chat model |
| Inline ghost text | `chat.completions` + stream | Follows instructions |
| `@currentFile` | Same | Context ≥ 8k tokens effective |

---

## 7. Cost & Rate Limits

EcoSystems does not mediate billing — user pays provider directly.

| Handling | Behavior |
|----------|----------|
| HTTP 429 | Retry twice with backoff; show "rate limited" |
| HTTP 401 | Show "invalid API key" |
| Context too long | Truncate per [ai-context-pipeline.md](../architecture/ai-context-pipeline.md) |

---

## 8. Testing Matrix (QA)

Before Phase 0 release, verify with real API key:

| # | Model | Chat stream | Inline | Pass |
|---|-------|-------------|--------|------|
| 1 | gpt-4o-mini | | | ☐ |
| 2 | gpt-4o | | | ☐ |
| 3 | Custom (Groq llama) | | | ☐ optional |

---

## 9. Roadmap

| Phase | Addition |
|-------|----------|
| 1 | Anthropic Claude (`claude-3-5-sonnet`, etc.) |
| 2 | Ollama (`llama3`, `codellama`, `mistral`) |
| 3 | Enterprise Azure default templates |

---

## 10. Related Documents

- [model-router.md](../architecture/model-router.md)
- [settings-schema.md](../architecture/settings-schema.md)
- [prompt-templates.md](./prompt-templates.md)
- ADR-009 in [05-architectural-decisions.md](../05-architectural-decisions.md)
