# Inline Completion UX Specification

Ghost-text AI completions in the Monaco editor (Phase 0).

**Last updated:** 2026-05-30

---

## 1. Overview

As the user types, EcoSystems IDE shows **gray ghost text** ahead of the cursor suggesting the next tokens. Matches Copilot/Cursor muscle memory.

**API:** Monaco `InlineCompletionsProvider`  
**Service:** `src/vs/platform/ecosystems/ai/inline/`

---

## 2. Visual Design

```
  3 │ function computeTotal(items: Item[]) {
  4 │   return items.reduce((sum, item) =>
  5 │     sum + item.price█ sum + item.price * item.qty, 0)
      │                      ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
      │                      ghost text (muted gray,  opacity ~0.4)
```

| Property | Value |
|----------|-------|
| Color | `--vscode-editorGhostText-foreground` (fallback: `#8888`) |
| Font | Same as editor |
| Style | No italic; no underline |
| Multi-line | Allowed if model returns newlines |

Ghost text appears **inline** at cursor — not in a popup or side panel.

---

## 3. Trigger Behavior

| Event | Action |
|-------|--------|
| User types | Start debounce timer (300ms default) |
| Debounce fires | Request completion if conditions met |
| Cursor moves | Cancel in-flight request |
| Selection changes | Cancel request |
| User types more | Cancel previous; re-debounce |
| AI disabled | No requests |
| No API key | No requests; no ghost text |

### Conditions to request

- Document language: programming language (not plaintext/markdown Phase 0 optional)
- File not read-only
- `ecosystems.ai.inline.enabled` = true
- Cursor in code context (not in comment-only line — best effort Phase 0)

---

## 4. Accept & Dismiss

| Input | Action |
|-------|--------|
| `Tab` | **Accept** full ghost suggestion |
| `Escape` | **Dismiss** ghost text |
| Continue typing | Dismiss if next char doesn't match ghost prefix |
| `Ctrl+Right Arrow` | Accept **next word** (Monaco default partial accept if enabled) |

**Do not steal Tab** when no ghost text visible — Tab behaves normally (indent, focus).

---

## 5. Interaction with IntelliSense

| Situation | Behavior |
|-----------|----------|
| IntelliSense widget open | Prefer IntelliSense; defer inline OR show inline below (Monaco default) |
| LSP snippet active | No inline request |
| Both visible | Inline ghost at cursor; widget separate |

Phase 0: follow Monaco default conflict resolution.

---

## 6. Loading State

No spinner in editor. Optional subtle indicator in **status bar**:

```
$(loading~spin) AI completing…
```

Clears on response or cancel. Omit spinner if latency < 200ms.

---

## 7. Empty & Error Handling

| Case | UX |
|------|-----|
| Model returns empty | No ghost text; silent |
| Request fails | No ghost text; optional one-time status bar toast |
| Rate limited | Status bar: "AI rate limited" for 3s |
| File too large | Truncate context silently |

**Never** show modal dialogs for inline failures.

---

## 8. Status Bar

Right side cluster (see [workbench-ia.md](./workbench-ia.md)):

| State | Display |
|-------|---------|
| Inline on | `$(sparkle) Inline` or combined with model name |
| Inline off | Hidden or `Inline off` |
| Toggle command | `ecosystems.ai.toggleInline` |

Click: open inline settings.

---

## 9. Settings (User-Facing)

| Setting | Label | Default |
|---------|-------|---------|
| `ecosystems.ai.inline.enabled` | Enable inline AI completions | true |
| `ecosystems.ai.inline.debounceMs` | Inline debounce (ms) | 300 |
| `ecosystems.ai.inline.model` | Inline model | gpt-4o-mini |

Master kill switch: `ecosystems.ai.enabled` disables inline.

---

## 10. Languages (Phase 0)

Inline enabled for:

- TypeScript / JavaScript
- Python
- JSON
- CSS / SCSS
- HTML

Other languages: enabled but best-effort (no special casing Phase 0).

---

## 11. Performance Targets

| Metric | Target |
|--------|--------|
| Debounce | 300ms |
| p95 latency to first token | < 2s |
| Max concurrent requests | 1 per editor |
| Cancel on cursor move | < 50ms |

---

## 12. Privacy

Inline sends cursor neighborhood to cloud provider — same policy as chat.

No visual "attached" chip in editor; disclosure in settings + status bar tooltip:

```
Inline completions send nearby code to your AI provider.
```

---

## 13. Acceptance Criteria

- [ ] Ghost text appears after pause in typing
- [ ] Tab inserts suggestion; cursor at end of insertion
- [ ] Esc removes ghost without inserting
- [ ] Typing does not lag or block editor
- [ ] Disabled via settings → no network calls
- [ ] Works in dark/light themes

---

## 14. Phase 1 Enhancements

- Accept partial suggestion (word/line)
- Lightbulb: "Explain suggestion"
- Per-language enable/disable
- `@selection` only mode for large files

---

## 15. Related Documents

- [workbench-ia.md](./workbench-ia.md)
- [ai-chat-panel.md](./ai-chat-panel.md)
- [prompt-templates.md](../ai/prompt-templates.md)
- [models-matrix.md](../ai/models-matrix.md)
