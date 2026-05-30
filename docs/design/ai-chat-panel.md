# AI Chat Panel UX Specification

Sidebar chat for EcoSystems IDE Phase 0.

**Implementation:** Webview in `src/vs/platform/ecosystems/browser/`  
**Last updated:** 2026-05-30

---

## 1. Overview

Single-column chat in the **sidebar** when user selects the AI activity bar icon. Supports streaming responses and `@currentFile` context.

**Out of scope Phase 0:** `@workspace`, `@git`, multi-tab chat, agent mode, image upload.

---

## 2. Panel Wireframe

```
┌─────────────────────────────┐
│  EcoSystems AI          [⚙] │  ← header: title + settings gear
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ You                 │    │
│  │ Explain this func   │    │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │ Assistant           │    │
│  │ This function adds… │    │
│  │ ```typescript       │    │
│  │ return a + b        │    │
│  │ ```        [Copy]   │    │
│  └─────────────────────┘    │
│                             │
│         (scroll area)       │
│                             │
├─────────────────────────────┤
│ 📎 app.ts (attached)    [×] │  ← context chip
├─────────────────────────────┤
│ Ask about your code…    [↑] │  ← input + send
│              [Stop]         │  ← visible while streaming
└─────────────────────────────┘
```

---

## 3. Header

| Element | Behavior |
|---------|----------|
| Title | "EcoSystems AI" |
| Settings (⚙) | Opens Settings filtered to `@ecosystems.ai` |
| No model dropdown in header Phase 0 | Model in settings only |

---

## 4. Message List

### User message bubble

- Align: right or full-width with subtle background
- Content: plain text (markdown rendered optional for user)
- Timestamp: optional Phase 0 (omit for simplicity)

### Assistant message bubble

- Align: left
- **Streaming:** Text appends token-by-token; blinking cursor at end
- **Markdown:** Render code blocks with language label
- **Code block actions:** `Copy` button per fenced block
- **Insert at cursor:** Phase 0 optional — `Copy` minimum; `Insert` nice-to-have

### Empty state

```
┌─────────────────────────────┐
│     $(sparkle)              │
│  Ask about your open file   │
│                             │
│  Attach: @currentFile       │
│  (automatic when enabled)   │
│                             │
│  [Add API key in Settings]  │  ← if not configured
└─────────────────────────────┘
```

---

## 5. Context Attachment — `@currentFile`

Phase 0: **automatic attach** of active editor file (no `@` autocomplete yet).

| State | UI |
|-------|-----|
| File attached | Chip: `📎 relative/path.ts` with remove (×) |
| Selection non-empty | Chip: `📎 path.ts (selection)` |
| No editor open | No chip; placeholder text adjusts |
| Secret file (`.env`) | Warning chip: `⚠ .env — may contain secrets` (yellow) |

Toggle in input area (Phase 0):

- Checkbox or chip toggle: **Include current file** — default ON

---

## 6. Input Area

| Element | Spec |
|---------|------|
| Input | Multiline textarea; 1–6 rows auto-grow |
| Send | Button or `Enter` ( `Shift+Enter` = newline) |
| Stop | Visible during stream; aborts fetch |
| Disabled state | When no API key or AI disabled globally |

**Placeholder text:**

- Default: `Ask about your code…`
- No key: `Add API key in Settings to use AI`
- AI off: `AI is disabled in Settings`

---

## 7. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+I` | Focus chat input |
| `Enter` | Send (if send on enter enabled) |
| `Shift+Enter` | New line |
| `Escape` | Cancel stream (if streaming) |

Configurable in keybindings — see Phase 1 `keybindings.md`.

---

## 8. Error States

| Error | UI |
|-------|-----|
| 401 Invalid key | Inline banner in panel + link to settings |
| 429 Rate limit | "Rate limited — try again in a moment" |
| Network offline | "Cannot reach AI provider. Check connection." |
| Timeout (60s) | "Request timed out" + retry button |
| Context too large | "File truncated to fit context limit" (warning before send) |

Errors appear as assistant-styled system message (muted red border).

---

## 9. Loading & Streaming

| Phase | UI |
|-------|-----|
| Request sent | Disable send; show Stop |
| First token | Hide typing indicator; stream text |
| Complete | Enable send; hide Stop |
| Cancelled | Partial message kept + "(stopped)" suffix |

Optional typing indicator before first token: three animated dots.

---

## 10. Privacy Disclosure

Footer microcopy (always visible):

```
Code may be sent to your configured AI provider.
```

Links to prompt data policy (Phase 0: docs URL or settings help link).

---

## 11. Webview Technical Notes

- **ADR-008:** Vanilla TS + CSS in webview (no React Phase 0)
- Theme: inherit VS Code CSS variables (`--vscode-*`)
- No direct network from webview — all LLM calls via extension host / main services
- No API keys in webview context

Message protocol: see [model-router.md](../architecture/model-router.md) §7.

---

## 12. Accessibility

| Requirement | Phase 0 |
|-------------|---------|
| Keyboard focus trap in input | ✅ |
| Screen reader: new message announced | Best effort |
| Contrast | Use VS Code theme tokens |
| Focus visible on send/stop | ✅ |

Full WCAG target: `docs/design/accessibility.md` (Phase 1).

---

## 13. Acceptance Criteria

- [ ] User sends message; response streams within 1s of first token
- [ ] Stop cancels in-flight request
- [ ] Active file attached by default; removable via chip
- [ ] Code block Copy works
- [ ] 401 shows actionable error
- [ ] Works in dark and light theme

---

## 14. Related Documents

- [workbench-ia.md](./workbench-ia.md)
- [inline-completion.md](./inline-completion.md)
- [prompt-templates.md](../ai/prompt-templates.md)
