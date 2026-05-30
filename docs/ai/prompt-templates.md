# Prompt Templates Catalog

Canonical prompt templates for EcoSystems IDE AI features.

**Source of truth in code:** `src/vs/platform/ecosystems/ai/context/templates/`  
**Last updated:** 2026-05-30

---

## 1. Template Engine

Phase 0: simple string interpolation (`{{variable}}`, `{{#if}}` blocks).

Phase 1: consider Handlebars if conditional logic grows.

Templates are versioned with the app; changes require QA on golden prompts.

---

## 2. Template Index

| ID | Feature | Phase | File (planned) |
|----|---------|-------|----------------|
| `inline-v1` | Inline completion | 0 | `inline-v1.txt` |
| `chat-system-v1` | Chat system prompt | 0 | `chat-system-v1.txt` |
| `chat-user-v1` | Chat user wrap | 0 | `chat-user-v1.txt` |
| `chat-with-file-v1` | File attachment block | 0 | `chat-with-file-v1.txt` |
| `workspace-v1` | `@workspace` context | 1 | `workspace-v1.txt` |
| `agent-system-v1` | Agent planner | 2 | `agent-system-v1.txt` |

---

## 3. `inline-v1` — Inline Completion

**Intent:** `inline.complete`  
**Model role:** Single user message (chat completions API)

```
You are a code completion assistant for EcoSystems IDE.
Output ONLY the text that should be inserted at the cursor.
Do not repeat existing code. Do not use markdown fences.
Do not explain.

Language: {{languageId}}
File: {{relativePath}}

<code_before>
{{cursorBefore}}
</code_before>

<code_after>
{{cursorAfter}}
</code_after>

Insert at cursor:
```

**Variables:**

| Variable | Source |
|----------|--------|
| `languageId` | Monaco document language |
| `relativePath` | Workspace-relative path |
| `cursorBefore` | Text before cursor (truncated) |
| `cursorAfter` | Text after cursor (truncated) |

**Stop sequences:** `\n\n`, markdown fence markers

---

## 4. `chat-system-v1` — Chat System Prompt

```
You are EcoSystems IDE assistant — an expert programming helper embedded in a VS Code-class editor.

Rules:
- Be concise and accurate.
- Use markdown for code blocks with language tags.
- If unsure, say so; do not invent APIs.
- Prefer showing code the user can copy.
- Do not claim to have run code or tests unless tool results are provided (Phase 2+).

The user may attach the current file as context. Treat attached code as read-only reference unless asked to rewrite.
```

---

## 5. `chat-with-file-v1` — Attached File Block

Appended to user message when `@currentFile` is active:

```
<file path="{{relativePath}}" language="{{languageId}}">
{{fileContent}}
</file>
```

If selection is non-empty, use `selectionContent` instead of full file and label as `selection`.

---

## 6. `chat-user-v1` — User Message Wrapper

Final user message assembly:

```
{{#if attachedBlock}}
{{attachedBlock}}
{{/if}}

{{userMessage}}
```

**History:** Prior turns sent as separate `messages[]` entries, not in template.

---

## 7. Example Assembled Chat Request

**System:** `chat-system-v1`

**User:**

```
<file path="src/utils.ts" language="typescript">
export function add(a: number, b: number) {
  return a + b;
}
</file>

What does this function do? Could it overflow?
```

---

## 8. Secret & Injection Guardrails (System Addendum)

Phase 0 — append to system prompt when attaching files:

```
Do not ask the user to paste secrets. If you see likely credentials, warn the user not to share them with cloud AI.
```

Phase 1 — secret scanner runs **before** template render; blocked content never reaches template.

---

## 9. Token Budget Interaction

Templates do not include token logic — [ai-context-pipeline.md](../architecture/ai-context-pipeline.md) truncates variables before render.

| Variable | Max chars (Phase 0) |
|----------|---------------------|
| `cursorBefore` + `cursorAfter` | 8 KB combined |
| `fileContent` | 100 KB |

---

## 10. Regression Tests

Golden prompts stored in `test/ai-eval/prompts/`:

| Test ID | Template | Assert |
|---------|----------|--------|
| P-001 | inline-v1 | Contains `Language: typescript` |
| P-002 | chat-with-file-v1 | Contains `<file path=` |
| P-003 | inline-v1 | No API key patterns in output |

---

## 11. Change Process

1. Edit template file
2. Bump template ID version (`inline-v2`) — do not mutate v1 in place after release
3. Update this catalog
4. Run AI eval prompts
5. Note in release changelog

---

## 12. Related Documents

- [ai-context-pipeline.md](../architecture/ai-context-pipeline.md)
- [models-matrix.md](./models-matrix.md)
- [prompt-data-policy.md](../security/prompt-data-policy.md)
