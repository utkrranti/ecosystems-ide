# Model Router & Provider Interface

Unified abstraction for LLM access in Altus IDE.

**Last updated:** 2026-05-31  
**Auth model:** [ADR-011](../05-architectural-decisions.md#adr-011-inbuilt-ai-via-ecosystems-gateway) — inbuilt via Altus AI Gateway (no user BYOK)

---

## 1. Purpose

The **Model Router** is the only module the IDE uses for AI. All features (inline, chat, future agent) go through it.

**Benefits:**

- Swap backends without UI changes
- Centralize session auth, retries, streaming, logging
- Enforce privacy controls (disable cloud, redact logs)
- Hide upstream providers from the desktop app

---

## 2. Architecture

```
IInlineAiService ──┐
IChatAiService   ──┼──► IModelRouterService ──► IEcosystemsGatewayProvider (default)
IAgentService    ──┘         │
                             │  HTTPS + user session / license
                             ▼
                    Altus AI Gateway
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          OpenAI       Anthropic        Ollama (Phase 2)
       (EcoSystems      (EcoSystems      (optional local
        keys only)       keys only)       gateway route)
```

**Flow:**

1. User signs in to Altus AI (or holds a valid license).
2. IDE stores **session token** in OS keychain — not provider API keys.
3. Model router sends chat/inline requests to the **gateway** with that token.
4. Gateway validates plan, rate limits, picks upstream model, calls OpenAI/Anthropic with **server-side keys**.

---

## 3. Core Interfaces

```typescript
type AiFeature = 'inline' | 'chat' | 'agent';

interface IModelRouterService {
  completeStream(request: CompletionRequest): AsyncIterable<string>;
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(): Promise<ConnectionTestResult>;
  getAvailableModels(): Promise<GatewayModelInfo[]>;
}

interface CompletionRequest {
  feature: 'inline';
  model: string;          // gateway model id, e.g. ecosystems/gpt-4o-mini
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

interface GatewayModelInfo {
  id: string;             // e.g. gpt-4o-mini
  displayName: string;
  tier: 'free' | 'pro' | 'team';
  features: AiFeature[];
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
  listModels(auth: AuthContext): Promise<GatewayModelInfo[]>;
}

type ProviderId = 'ecosystems' | 'ollama';   // Phase 0: ecosystems only

interface AuthContext {
  sessionToken: string;   // from ISecretsService — EcoSystems session, never sk-...
  gatewayBaseUrl: string; // e.g. https://api.ecosystems.dev or http://localhost:8080
}
```

**Phase 0:** Only `ecosystems` provider is registered. Direct OpenAI/Anthropic clients are **not** exposed in the IDE.

---

## 5. Altus AI Gateway Provider (Phase 0 default)

**Base URL (configurable):**

| Environment | URL |
|-------------|-----|
| Production | `https://api.ecosystems.dev/v1` (placeholder) |
| Local dev | `http://localhost:8080/v1` |

### Endpoints (IDE → Gateway)

| Feature | Method | Path | Stream |
|---------|--------|------|--------|
| Chat | POST | `/ai/chat/completions` | SSE |
| Inline | POST | `/ai/completions` or `/ai/chat/completions` | SSE |
| List models | GET | `/ai/models` | — |
| Health / test | GET | `/ai/health` | — |

### Request headers

```
Authorization: Bearer <sessionToken>
Content-Type: application/json
X-EcoSystems-Client: ecosystems-ide/<version>
```

### Retry policy

| Error | Action |
|-------|--------|
| 429 | Exponential backoff, max 2 retries; show "rate limited" |
| 401 / 403 | Fail immediately; UI "Sign in" or "Upgrade plan" |
| 402 | Quota exceeded; show upgrade prompt |
| 5xx | Retry once after 2s |
| Network | Fail; show offline message |

---

## 6. Model Selection

Settings-driven (see [settings-schema.md](./settings-schema.md)):

| Feature | Setting | Phase 0 default |
|---------|---------|-----------------|
| Chat | `ecosystems.ai.chat.model` | `gpt-4o-mini` |
| Inline | `ecosystems.ai.inline.model` | `gpt-4o-mini` |

Router reads settings at request time. **Allowed models** come from `GET /ai/models` filtered by user tier.

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
[AI] chat request model=gpt-4o-mini tokens≈1200 latency=890ms
```

**Never log:** prompt body, response body, session token, upstream API keys.

Production: aggregate metrics via gateway; optional opt-in telemetry in IDE (Phase 1).

---

## 9. Feature Flags & Kill Switch

| Flag | Effect |
|------|--------|
| `ecosystems.ai.enabled = false` | Router rejects all requests |
| Not signed in | Router throws `AiErrorCode.NOT_AUTHENTICATED` |
| `ecosystems.ai.provider = none` | Same as disabled |

---

## 10. Connection Test

`testConnection()` calls `GET /ai/health` with session token.

Success: 200, latency < 10s. Used by settings UI **Test connection** after sign-in.

---

## 11. Provider Roadmap

| Route | Phase | Notes |
|-------|-------|-------|
| Altus AI Gateway → OpenAI | 0 | Default; inbuilt |
| Altus AI Gateway → Anthropic | 1 | Server-side adapter |
| Gateway → Ollama / local | 2 | Optional self-hosted gateway |
| Enterprise BYOK | 3+ | Separate tier; not default consumer path |

---

## 12. ADR Reference

**Inbuilt AI:** [ADR-011](../05-architectural-decisions.md#adr-011-inbuilt-ai-via-ecosystems-gateway).  
**Supersedes:** ADR-009 (BYOK).

---

## 13. Acceptance Tests

- [ ] Mock gateway: inline stream yields tokens
- [ ] Mock 401: UI prompts sign-in
- [ ] Mock 402: UI shows quota / upgrade
- [ ] Cancel mid-stream: abort controller stops fetch
- [ ] Disabled AI: no HTTP calls made
- [ ] Logs contain no `sk-` or session token patterns
- [ ] Webview bundle contains no secrets

---

## 14. Related Documents

- [ai-context-pipeline.md](./ai-context-pipeline.md)
- [settings-schema.md](./settings-schema.md)
- [models-matrix.md](../ai/models-matrix.md)
- [secrets-and-keychain.md](../security/secrets-and-keychain.md)
- [PRD v1 Phase 0](../product/PRD-v1-phase0.md)
