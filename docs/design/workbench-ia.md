# Workbench Information Architecture & Wireframes

Layout and navigation for Altus IDE Phase 0 — VS Code parity plus AI sidebar.

**Last updated:** 2026-05-30

---

## 1. Design Principle

**Familiar first.** Users coming from VS Code should recognize every default surface. AI is **additive** — new activity bar icon, not a redesigned shell.

---

## 2. Phase 0 Layout (ASCII Wireframe)

```
┌──┬──────────────┬────────────────────────────────────────┬──┐
│A │   SIDEBAR    │           EDITOR AREA                  │M │
│C │              │  ┌──────────────────────────────────┐  │I │
│T │  [Explorer]  │  │ tab: app.ts  │ tab: utils.ts      │  │N │
│I │  [Search]    │  ├──────────────────────────────────┤  │I │
│V │  [SCM]       │  │ 1 │ import { x } from './utils'    │  │M │
│I │  [Run]       │  │ 2 │                              │  │A │
│T │  [Ext]       │  │ 3 │ function main() {            │  │P │
│Y │  [AI ★]      │  │ 4 │   const result = compute█    │  │  │
│  │              │  │   │         ░░░ ghost text ░░░   │  │  │
│  │              │  └──────────────────────────────────┘  │  │
│  │              │                                          │  │
├──┴──────────────┴────────────────────────────────────────┴──┤
│  PANEL (Terminal │ Problems │ Output)                        │
│  > npm test                                                  │
├──────────────────────────────────────────────────────────────┤
│  Status: main │ TypeScript │ ✓ AI: gpt-4o-mini │ Ln 4, Col 28│
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Activity Bar

| Icon | View | Phase 0 | Notes |
|------|------|---------|-------|
| Explorer | File tree | ✅ Inherited | Default active |
| Search | Workspace search | ✅ | |
| SCM | Git | ✅ | |
| Run and Debug | Debug | ✅ | |
| Extensions | Extensions | ✅ | No marketplace Phase 0 |
| **AI** | Chat sidebar | ✅ **New** | Spark/chat icon; below Extensions |

**AI icon position:** Last item in activity bar (or second-to-last if Run grouped).

---

## 4. Sidebar Views

### Default (Explorer active)

Standard VS Code explorer — unchanged.

### AI Chat active (Phase 0)

Replaces sidebar **content** when AI icon clicked; activity bar selection switches.

See [ai-chat-panel.md](./ai-chat-panel.md) for chat interior layout.

**Do not** hide Explorer permanently — user clicks Explorer icon to return.

---

## 5. Editor Area

| Element | Phase 0 behavior |
|---------|------------------|
| Tabs | Unchanged |
| Breadcrumbs | Unchanged |
| Inline ghost text | Monaco inline completions |
| Gutter | No AI-specific markers Phase 0 |
| Minimap | Unchanged |

**No** floating AI overlay on editor Phase 0.

---

## 6. Panel Region

| Tab | Phase 0 |
|-----|---------|
| Terminal | ✅ |
| Problems | ✅ |
| Output | ✅ |
| Debug Console | ✅ |
| AI Transcript | ❌ Phase 1 (chat stays in sidebar) |

---

## 7. Status Bar (Right Side)

Left-to-right on right cluster:

```
[ $(sparkle) AI ]  gpt-4o-mini  │  Ln 42, Col 10  │  UTF-8  │  LF
```

| Item | Click action |
|------|--------------|
| AI indicator | Open AI settings |
| Model name | Open model picker (settings) |

When AI disabled: `$(circle-slash) AI off`

---

## 8. Command Palette (AI Commands Phase 0)

| Command | ID |
|---------|-----|
| Altus AI: Open Chat | `ecosystems.ai.openChat` |
| Altus AI: Focus Chat Input | `ecosystems.ai.focusChat` |
| Altus AI: Toggle Inline Completions | `ecosystems.ai.toggleInline` |
| Altus AI: Open Settings | `workbench.action.openSettings` → `@ecosystems.ai` |

---

## 9. Settings Location

**File → Preferences → Settings** → search `Altus AI`

Dedicated settings section with icon in tree: **Altus AI**

---

## 10. First-Run Flow

```
Launch app
  → Empty window (VS Code default)
  → Optional: Welcome page (upstream) + banner if no API key
  → User: Open Folder
  → User: Click AI icon → prompted to add API key in settings
  → User: Returns to chat → sends first message
```

No blocking modal on first launch.

---

## 11. Responsive Behavior

| Window width | Behavior |
|--------------|----------|
| < 800px | Sidebar collapses (inherited) |
| AI sidebar open | Min width 280px for chat panel |

---

## 12. Phase 1 Additions (Preview)

- `@` context picker in chat input
- Diff review in editor split (not sidebar)
- `.ide/rules` indicator in status bar

---

## 13. Related Documents

- [ai-chat-panel.md](./ai-chat-panel.md)
- [inline-completion.md](./inline-completion.md)
- [01-product-vision.md](../01-product-vision.md)
