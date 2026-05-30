# Model Router & Provider Interface

Unified abstraction for LLM providers in EcoSystems IDE.

**Last updated:** 2026-05-30

---

## 1. Purpose

The **Model Router** is the only module that calls external LLM APIs. All AI features (inline, chat, future agent) go through it.

**Benefits:**

- Swap providers without UI changes
- Centralize auth, retries, streaming, logging
- Enforce privacy controls (disable cloud, redact logs)

---

## 2. Architecture

```
IInlineAiService ──┐
IChatAiService   ──┼──► IModelRouterService ──► ICompletionProvider
IAgentService    ──┘         │                IChatProvider
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
            OpenAiCompatible    AnthropicProvider (Phase 1)
            Provider                  OllamaProvider (Phase 2)
```

---

## 3. Core Interfaces

```typescript
type AiFeature = 'inline' | 'chat' | 'agent';

interface IModelRouterService {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  completeStream(request: CompletionRequest): AsyncIterable<string>;
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(provider: ProviderId): Promise<ConnectionTestResult>;
  getAvailableModels(provider: ProviderId): Promise<string[]>;
}

interface CompletionRequest {
  feature: 'inline';
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  stop?: string[];
}

interface ChatRequest {
  feature: 'chat' | 'agent';
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatChunk {
  type: 'text' | 'done' | 'error';
  text?: string;
  error?: AiError;
}
```

---

## 4. Provider Interface

```typescript
interface ILLMProvider {
  readonly id: ProviderId;
  supportsFeature(feature: AiFeature): boolean;
  completeStream(req: CompletionRequest, auth: AuthContext): AsyncIterable<string>;
  chatStream(req: ChatRequest, auth: AuthContext): AsyncIterable<ChatChunk>;
  listModels(auth: AuthContext): Promise<string[]>;
}

type ProviderId = 'openai' | 'anthropic' | 'ollama' | 'custom';

interface AuthContext {
  apiKey: string;       // from ISecretsService — never logged
  baseUrl?: string;
}
```

---

## 5. OpenAI-Compatible Provider (Phase 0)

**Default provider.** Implements chat + completions against:

- `https://api.openai.com/v1` (default)
- Custom base URL for Azure, LiteLLM, vLLM

### Endpoints

| Feature | API | Stream |
|---------|-----|--------|
| Inline | `POST /v1/completions` or `/v1/chat/completions` | SSE |
| Chat | `POST /v1/chat/completions` | SSE |

**Phase 0 choice:** Use **chat completions** for both inline and chat (single code path). Map inline prompt as single user message with system prefix.

### Request headers

```
Authorization: Bearer <apiKey>
Content-Type: application/json
```

### Retry policy

| Error | Action |
|-------|--------|
| 429 | Exponential backoff, max 2 retries |
| 401 | Fail immediately; UI "invalid API key" |
| 5xx | Retry once after 2s |
| Network | Fail; show offline message |

---

## 6. Model Selection

Settings-driven (see [settings-schema.md](./settings-schema.md)):

| Feature | Setting | Phase 0 default |
|---------|---------|-----------------|
| Chat | `ecosystems.ai.chat.model` | `gpt-4o-mini` |
| Inline | `ecosystems.ai.inline.model` | `gpt-4o-mini` |

Router reads settings at request time; no hardcoded model in feature code.

---

## 7. Streaming Protocol (Main ↔ Webview)

Chat webview receives messages via `postMessage`:

```typescript
// Main → Webview
{ type: 'chat.chunk', text: 'partial...' }
{ type: 'chat.done' }
{ type: 'chat.error', code: 'AUTH_FAILED', message: '...' }

// Webview → Main
{ type: 'chat.send', message: '...', attachCurrentFile: true }
{ type: 'chat.cancel' }
```

Inline completion uses Monaco API directly in main thread — no webview.

---

## 8. Logging & Redaction

Router logs (dev only):

```
[AI] chat request provider=openai model=gpt-4o-mini tokens≈1200 latency=890ms
```

**Never log:** prompt body, response body, api key.

Production: log aggregate metrics only (Phase 1 opt-in telemetry).

---

## 9. Feature Flags & Kill Switch

| Flag | Effect |
|------|--------|
| `ecosystems.ai.enabled = false` | Router rejects all requests |
| Missing API key | Router throws `AiErrorCode.NOT_CONFIGURED` |
| `ecosystems.ai.provider = none` | Same as disabled |

---

## 10. Connection Test

`testConnection()` sends minimal request:

```json
{ "model": "<configured>", "messages": [{"role":"user","content":"ping"}], "max_tokens": 5 }
```

Success: latency < 10s, no 401. Used by settings UI "Test connection" button.

---

## 11. Provider Roadmap

| Provider | Phase | Notes |
|----------|-------|-------|
| OpenAI-compatible | 0 | Default |
| Anthropic (Messages API) | 1 | Separate adapter |
| Ollama | 2 | Local HTTP, no key |
| Azure OpenAI | 1 | Via custom base URL + deployment name |

---

## 12. ADR-009 (Accepted)

**Default cloud provider:** OpenAI-compatible API with user BYOK. See [05-architectural-decisions.md](../05-architectural-decisions.md) ADR-009.

---

## 13. Acceptance Tests

- [ ] Mock provider: inline stream yields tokens
- [ ] Mock 401: UI shows auth error
- [ ] Cancel mid-stream: abort controller stops fetch
- [ ] Disabled AI: no HTTP calls made
- [ ] Logs contain no `sk-` patterns

---

## 14. Related Documents

- [ai-context-pipeline.md](./ai-context-pipeline.md)
- [secrets-and-keychain.md](../security/secrets-and-keychain.md)
- [PRD v1 Phase 0](../product/PRD-v1-phase0.md)
