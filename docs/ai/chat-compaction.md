# Chat compaction and context

Altus AI compacts long conversations so agent turns stay within model context limits, similar to Copilot/Cursor-style background summarization.

## Behavior

- **Background compaction** runs after each turn when context usage crosses a threshold (default 72%) or enough new messages accumulate since the last summary.
- **Send is not blocked** except when context is critical (≥90% and the cached summary is stale); then the UI waits up to 8 seconds for an in-flight compaction to finish.
- **Wire history** sent to the model uses a system preamble with the summary plus the most recent messages (`ecosystems.ai.chat.compact.keepRecent`).
- **UI**: status bar shows a context meter; a banner at the top of the chat notes when earlier messages were compacted. Auto-compact does not post a chat message; manual `/compact` or the toolbar action can optionally notify in-chat.

## Commands

| Input | Action |
|-------|--------|
| `/compact` | Summarize older messages in the background (or foreground if background is disabled). |
| `/compact focus on API changes` | Same, with extra instructions for the summarizer. |

Toolbar: **Compact Conversation** (fold icon) in the chat view title.

## Settings (`ecosystems.ai.chat.*`)

| Setting | Default | Description |
|---------|---------|-------------|
| `compact.enabled` | `true` | Master switch. |
| `compact.background` | `true` | Run compaction after turns instead of blocking send. |
| `compact.thresholdPercent` | `72` | Start background compaction when estimated context ≥ this %. |
| `compact.afterMessages` | `24` | Also compact when enough persistable messages exist. |
| `compact.keepRecent` | `10` | Recent messages kept verbatim in wire history. |
| `compact.model` | *(empty)* | Fast model for summarization; defaults to `gpt-4o-mini`. |
| `contextBudgetChars` | `96000` | Denominator for the context meter (chars ≈ tokens×4). |

Checkpoints (`checkpoints.enabled`) are separate: they snapshot full message history for restore, not model context.
