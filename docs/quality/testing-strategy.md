# Testing Strategy

How to test **Altus IDE** code, workbench UI, and **in-app webviews** (chat panel runs inside Electron’s embedded browser).

**Phase:** 0  
**Last updated:** 2026-05-30

---

## 1. Test Pyramid

```
                    ┌─────────────┐
                    │  Manual QA  │  ← release gate
                    ├─────────────┤
                    │  E2E smoke  │  ← Playwright + Electron
                    ├─────────────┤
                    │ Integration │  ← webview protocol, DI services
                    ├─────────────┤
                    │  Unit tests │  ← Mocha (majority)
                    └─────────────┘
```

| Layer | What | Tool | When run |
|-------|------|------|----------|
| **Unit** | Services, router, context, templates | Mocha + assert/sinon | Every PR |
| **Integration** | Webview ↔ main `postMessage`, keychain mock | Mocha | Every PR |
| **E2E** | Launch app, open chat, type, see stream | Playwright + Electron | PR + nightly |
| **Webview DOM** | Chat UI rendering, buttons, scroll | Playwright (in webview frame) or jsdom | PR (critical paths) |
| **Manual** | Exploratory, themes, real API key | Human | Pre-release |
| **AI eval** | Prompt regression (Phase 1+) | Custom harness | Weekly |

**Goal Phase 0:** Unit + integration for AI services; one E2E smoke; manual checklist before v0.1.0.

---

## 2. Test Layout

```
test/
├── unit/ecosystems/
│   ├── modelRouter.test.ts
│   ├── contextBuilder.test.ts
│   ├── promptTemplates.test.ts
│   ├── keychainService.test.ts
│   └── secretRedaction.test.ts
├── integration/ecosystems/
│   ├── chatMessageProtocol.test.ts    # main ↔ webview messages
│   └── inlineProvider.test.ts
├── e2e/ecosystems/
│   ├── fixtures/
│   │   └── sample-workspace/          # tiny TS project
│   ├── helpers/
│   │   ├── launchApp.ts
│   │   └── webview.ts                 # find AI chat frame
│   ├── smoke.launch.test.ts
│   ├── smoke.chat.test.ts
│   └── smoke.inline.test.ts
└── ai-eval/                           # Phase 1+
    └── prompts/
```

Inherited upstream tests remain under VS Code’s existing `test/` tree — **EcoSystems tests live in subfolders** above.

---

## 3. Unit Testing (Code)

### Stack

| Tool | Purpose |
|------|---------|
| **Mocha** | Test runner (VS Code default) |
| **assert** / **chai** | Assertions |
| **sinon** | Mocks, stubs, spies |
| **nock** or **mock fetch** | HTTP mock for LLM APIs |

### What to unit test

| Module | Tests |
|--------|-------|
| `ModelRouterService` | Provider selection, kill switch, retry on 429, no call when disabled |
| `OpenAiProvider` | Stream parsing, auth header, error mapping |
| `ContextBuilder` | Truncation, selection vs full file, token budget |
| `PromptTemplates` | Variable substitution, no raw keys in output |
| `KeychainService` | set/get/delete; mock keytar |
| `SecretRedaction` | Log scrubbing patterns |

### Example (pattern)

```typescript
// test/unit/ecosystems/modelRouter.test.ts
import assert from 'assert';
import { ModelRouterService } from '../../../out/vs/platform/ecosystems/ai/router/modelRouter.js';

suite('ModelRouterService', () => {
  test('does not call provider when ai.enabled is false', async () => {
    const router = createRouter({ enabled: false });
    await assert.rejects(() => router.chat(mockRequest()), /NOT_CONFIGURED|disabled/i);
  });
});
```

### Run

```powershell
yarn compile
yarn test --grep ecosystems
# Or full suite:
yarn test
```

### Rules

- **No real API keys** in unit tests — mock HTTP
- **No network** in unit tests by default
- Tests must pass in CI without keychain (mock `keytar`)

---

## 4. Integration Testing

Tests that cross module boundaries but don’t launch full UI.

### 4.1 Webview message protocol (chat)

Test the **main-process handler** that receives webview `postMessage` events:

| Case | Assert |
|------|--------|
| `{ type: 'chat.send', message: 'hi' }` | Router `chat()` called once |
| `{ type: 'chat.cancel' }` | AbortSignal fired |
| Stream chunks | Main posts `{ type: 'chat.chunk', text }` to webview |
| 401 from provider | Main posts `{ type: 'chat.error', code: 'AUTH_FAILED' }` |

**Mock:** `IWebview` with spy on `postMessage`; mock `IModelRouterService`.

```typescript
// test/integration/ecosystems/chatMessageProtocol.test.ts
suite('Chat webview protocol', () => {
  test('chat.send forwards to router and streams chunks', async () => {
    const webview = new MockWebview();
    const router = new MockRouter({ chunks: ['Hello', ' world'] });
    const handler = new ChatWebviewHandler(webview, router);

    await handler.onMessage({ type: 'chat.send', message: 'test', attachCurrentFile: false });

    assert.deepStrictEqual(webview.posted, [
      { type: 'chat.chunk', text: 'Hello' },
      { type: 'chat.chunk', text: ' world' },
      { type: 'chat.done' },
    ]);
  });
});
```

### 4.2 Inline completion provider

Integration with mock editor model + mock router:

- Debounce fires after 300ms (fake timers)
- Cursor move cancels pending request
- Ghost text mapped to Monaco `InlineCompletion` shape

---

## 5. E2E Testing (Full App UI)

### Stack

| Tool | Purpose |
|------|---------|
| **Playwright** | Drive Electron app, assert DOM |
| **@vscode/test-electron** | Launch built app with test user data dir (optional, VS Code pattern) |

Phase 0: Playwright against **dev build** launched via script.

### Launch helper

```typescript
// test/e2e/ecosystems/helpers/launchApp.ts
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

export async function launchEcoSystemsIDE(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    executablePath: path.join(__dirname, '../../../scripts/code.bat'), // dev build
    env: {
      ...process.env,
      VSCODE_DEV: '1',
      ECOSYSTEMS_TEST: '1',           // use mock AI provider in test builds
    },
  });
  const window = await app.firstWindow();
  return { app, window };
}
```

**Test mode flag:** When `ECOSYSTEMS_TEST=1`, register a **MockLLMProvider** that returns fixed streams (no cloud calls in CI).

### Smoke tests (Phase 0 minimum)

| ID | Test | Steps |
|----|------|-------|
| E2E-01 | App launches | Launch → window title contains "EcoSystems" |
| E2E-02 | Open folder | Open sample workspace → file visible in explorer |
| E2E-03 | Terminal | `` Ctrl+` `` → terminal accepts input |
| E2E-04 | AI sidebar | Click AI activity bar → chat input visible |
| E2E-05 | Chat stream | Type message → mock response appears in thread |
| E2E-06 | Inline ghost | Open `.ts` file → type → ghost text appears (mock) |

### Run E2E

```powershell
yarn compile
yarn playwright install
yarn playwright test test/e2e/ecosystems
```

---

## 6. In-App Browser / Webview Testing

The AI **chat panel is a webview** — an embedded Chromium surface inside Electron (same engine as “Simple Browser” / extension webviews). Test it at three levels:

### Level A — Webview JS in isolation (fast)

Extract pure functions from webview script:

- `renderMessage(role, content)`
- `appendStreamChunk(text)`
- `parseIncomingMessage(event.data)`

Test with **jsdom** or Node:

```powershell
yarn test --grep "webview ui"
```

No Electron required.

### Level B — Webview inside running app (Playwright)

Playwright can target **webview frames** in Electron:

```typescript
// test/e2e/ecosystems/smoke.chat.test.ts
test('chat webview sends message and shows response', async () => {
  const { app, window } = await launchEcoSystemsIDE();

  // Open AI sidebar
  await window.click('[aria-label="Altus AI"]'); // activity bar

  // Webviews often appear as iframe or separate frame — use frame locator
  const chatFrame = window.frameLocator('iframe.webview');

  await chatFrame.locator('textarea[placeholder*="Ask"]').fill('What is 2+2?');
  await chatFrame.locator('button[aria-label="Send"]').click();

  await expect(chatFrame.locator('.assistant-message')).toContainText('4', { timeout: 10_000 });

  await app.close();
});
```

**Tips for webview selectors:**

- Add `data-testid` attributes in webview HTML (`data-testid="chat-input"`, `chat-send`, `message-list`)
- Use VS Code theme classes sparingly in selectors — prefer test IDs
- Webview devtools: command **Developer: Open Webview Developer Tools** (manual debug)

### Level C — Visual / theme regression (optional Phase 1)

- Screenshot chat panel in dark + light theme
- Compare with stored baseline (Playwright `toHaveScreenshot`)

### Webview security tests

| Test | Assert |
|------|--------|
| Webview cannot fetch LLM directly | No `fetch('api.openai.com')` in webview bundle |
| API key not in webview HTML | Grep built webview assets for `sk-` |
| `postMessage` origin check | Reject messages from wrong source |

---

## 7. Mock AI Provider (CI & Local)

Avoid cloud dependency in automated tests.

```typescript
// src/vs/platform/ecosystems/ai/router/mockProvider.ts
export class MockLLMProvider implements ILLMProvider {
  readonly id = 'mock' as const;

  async *chatStream() {
    yield { type: 'text' as const, text: 'Mock response for tests.' };
    yield { type: 'done' as const };
  }
}
```

Register when `process.env.ECOSYSTEMS_TEST === '1'` or `--use-mock-ai` CLI flag.

**Live API tests:** Separate optional suite `test/live/` — run manually with `ECOSYSTEMS_LIVE_API_KEY`, never in CI.

---

## 8. Manual QA Checklist (Phase 0)

Run before each release candidate. Use **real API key** once.

### Core IDE (no AI)

- [ ] Open folder, edit file, save
- [ ] Search in files
- [ ] Git: see changed file
- [ ] Terminal: run `npm test` or `echo ok`
- [ ] TypeScript: error squiggle on bad code

### AI — Settings

- [ ] Add API key → Test connection → success
- [ ] Restart app → key still works
- [ ] Disable AI → no network to provider (verify via log or proxy)
- [ ] Export settings → no `sk-` in file

### AI — Chat (webview)

- [ ] Open AI sidebar; empty state shows
- [ ] Send question with file open → answer references code
- [ ] Selection only attached when text selected
- [ ] `.env` open → warning banner
- [ ] Stop button cancels stream
- [ ] 401 shown with bad key
- [ ] Dark + light theme readable

### AI — Inline

- [ ] Ghost text after pause in `.ts` file
- [ ] Tab accepts; Esc dismisses
- [ ] Toggle inline off → no ghost text

### In-app browser sanity

- [ ] Webview loads without CSP errors (Help → Toggle Developer Tools → Console)
- [ ] No mixed content warnings
- [ ] Resize sidebar — chat layout not broken

---

## 9. CI Pipeline (Summary)

See `docs/dev/ci-cd.md` when written. Target jobs:

```yaml
# PR job
- yarn compile
- yarn test --grep ecosystems
- yarn playwright test test/e2e/ecosystems  # with ECOSYSTEMS_TEST=1
```

E2E may run on `windows-latest` only initially (primary platform).

---

## 10. Debugging Tests

| Problem | Action |
|---------|--------|
| Webview not found in Playwright | List frames: `page.frames().map(f => f.url())` |
| Flaky stream assertion | Wait for `chat.done` message or network idle |
| Keychain fails in CI | Use mock secrets service |
| Electron won't launch in CI | Use `@playwright/test` `_electron` with built binary |

**Manual webview debug:**

1. Launch dev app
2. Open AI chat
3. Command palette → **Developer: Open Webview Developer Tools**
4. Inspect DOM, console, network (should be empty for LLM — calls go via main)

---

## 11. Coverage Targets (Phase 0)

| Area | Target |
|------|--------|
| `ai/router/` | ≥ 80% lines |
| `ai/context/` | ≥ 70% lines |
| `ai/secrets/` | ≥ 80% lines |
| Webview protocol handler | 100% message types |
| E2E smoke | 6 tests green |

No hard global coverage gate Phase 0 — focus on AI critical paths.

---

## 12. Phase 1 Additions

- AI eval harness (`test/ai-eval/`)
- Visual regression for chat
- `@vscode/test-electron` extension-style tests
- Performance: startup time budget test

---

## 13. Related Documents

- [definition-of-done.md](./definition-of-done.md)
- [phase0-backlog.md](../program/phase0-backlog.md) — E5-02, E5-04
- [ai-chat-panel.md](../design/ai-chat-panel.md) — webview UX
- [model-router.md](../architecture/model-router.md) — message protocol
- [repo-layout.md](../architecture/repo-layout.md) — test folders
