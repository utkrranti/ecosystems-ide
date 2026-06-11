# AI Context Pipeline Specification

How Altus IDE gathers, ranks, truncates, and assembles context before LLM requests.

**Phase coverage:** Phase 0 (minimal) → Phase 1 (full)  
**Last updated:** 2026-05-30

---

## 1. Overview

```
Trigger (inline | chat)
    → Intent + feature config
    → Source collectors (parallel)
    → Rank & dedupe
    → Token budget allocator
    → Prompt template render
    → Model router
```

**Design goals:**

- Predictable: same inputs → same context shape
- Bounded: never exceed model context window
- Extensible: new sources plug in without rewriting router

---

## 2. Triggers & Intents

| Trigger | Intent ID | Phase |
|---------|-----------|-------|
| Keystroke debounce | `inline.complete` | 0 |
| Chat send | `chat.ask` | 0 |
| `@currentFile` attach | `chat.ask` + source | 0 |
| `@workspace` | `chat.ask` + workspace | 1 |
| `@git` | `chat.ask` + git | 1 |
| Agent step | `agent.tool` | 2 |

Phase 0 implements **`inline.complete`** and **`chat.ask`** only.

---

## 3. Context Sources

### Phase 0 sources

| Source ID | Data | Collector | Default priority |
|-----------|------|-----------|------------------|
| `cursor.region` | ±50 lines around cursor | Inline only | 100 |
| `activeFile.full` | Full buffer (truncated) | Chat `@currentFile` | 90 |
| `activeFile.selection` | Selected text | Chat if selection non-empty | 95 |
| `document.languageId` | e.g. `typescript` | Both | 80 |
| `document.relativePath` | `src/foo.ts` | Both | 70 |
| `chat.history` | Prior turns in session | Chat only | 60 |

### Phase 1 additions

| Source ID | Data |
|-----------|------|
| `workspace.symbols` | LSP + tree-sitter index |
| `git.diff.staged` | Staged changes |
| `git.diff.unstaged` | Working tree diff |
| `diagnostics.errors` | Current file + workspace errors |
| `rules.project` | `.ide/rules` content |
| `search.ripgrep` | Query-based file snippets |

### Phase 2 additions

| Source ID | Data |
|-----------|------|
| `vector.chunks` | Embedding retrieval top-k |
| `terminal.recent` | Last N lines of active terminal |
| `test.output` | Last test run summary |

---

## 4. Source Interface

```typescript
interface IContextSource {
  readonly id: string;
  readonly priority: number;
  isAvailable(intent: AiIntent): boolean;
  collect(options: CollectOptions): Promise<ContextChunk[]>;
}

interface ContextChunk {
  id: string;
  type: 'code' | 'text' | 'metadata';
  content: string;
  label: string;        // e.g. "src/app.ts (lines 10-40)"
  estimatedTokens: number;
  priority: number;
}
```

New sources register in `ContextSourceRegistry` at startup.

---

## 5. Token Budget Allocator

### Defaults (Phase 0)

| Model window | Reserved for response | Available for context |
|--------------|----------------------|------------------------|
| 128k | 4,096 tokens | 8,192 tokens (cap intentionally low) |

**Allocator algorithm:**

1. Sort chunks by priority descending
2. Greedy add until budget exhausted
3. Large chunks may be **trimmed** (keep start/end with `...` marker)
4. Always include `document.languageId` and user message if chat

### Trimming rules

| Chunk type | Max tokens | Trim strategy |
|--------------|------------|---------------|
| Inline cursor region | 2,048 | Drop lines farthest from cursor |
| Chat file attach | 6,000 | Head + tail if over budget |
| Chat history | 2,000 | Drop oldest turns |

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // Phase 0 heuristic; Phase 1: tiktoken
}
```

---

## 6. Prompt Templates

### Inline completion (Phase 0)

```
System: You are a code completion assistant. Output only the completion text.

Language: {{languageId}}
File: {{relativePath}}

Code before cursor:
{{cursorBefore}}

Code after cursor:
{{cursorAfter}}

Complete at cursor:
```

### Chat (Phase 0)

```
System: You are Altus IDE assistant. Help with code questions.
Answer concisely. Use markdown for code blocks.

{{#if attachedFile}}
File: {{attachedFile.path}}
```{{attachedFile.language}}
{{attachedFile.content}}
```
{{/if}}

{{#each history}}
{{role}}: {{content}}
{{/each}}

User: {{userMessage}}
```

Templates live in `src/vs/platform/ecosystems/ai/context/templates/`.

---

## 7. Deduplication

- Same file content from selection + full file → keep selection only
- Identical chunks from multiple sources → merge labels, single copy

---

## 8. Caching (Phase 1)

| Cache | Key | TTL |
|-------|-----|-----|
| Symbol index | workspace path + mtime | Until file change |
| Ripgrep results | query hash | 60 s |
| Token counts | content hash | Session |

Phase 0: **no cache** except in-memory chat history.

---

## 9. Error Handling

| Condition | Behavior |
|-----------|----------|
| File > 100 KB | Truncate + UI warning chip |
| Empty file | Inline: no request; Chat: send message only |
| Binary file | Exclude from attach; show error |
| Token budget zero | Refuse request; suggest narrower selection |

---

## 10. Privacy Hooks

Before `ModelRouter.send()`:

1. Phase 0: warn on `.env`, `*.pem`, `*credentials*` filenames
2. Phase 1: `SecretScanner.scan(chunks)` — block or redact

See [prompt-data-policy.md](../security/prompt-data-policy.md).

---

## 11. Observability (Dev)

Debug command: `Developer: Show AI Context Preview`

- Lists chunks, token counts, final prompt (keys redacted)
- Phase 0 dev-only; gated behind `--enable-ai-debug` flag

---

## 12. Acceptance Criteria

### Phase 0

- [ ] Inline request includes cursor neighborhood only
- [ ] Chat with selection sends selection, not full file
- [ ] Chat without selection sends file up to 100 KB cap
- [ ] Total context never exceeds configured budget
- [ ] Context preview command works in dev builds

### Phase 1

- [ ] `@workspace` adds relevant symbols within budget
- [ ] Secret scanner blocks `.env` content

---

## 13. Related Documents

- [model-router.md](./model-router.md)
- [settings-schema.md](./settings-schema.md)
- [prompt-data-policy.md](../security/prompt-data-policy.md)
