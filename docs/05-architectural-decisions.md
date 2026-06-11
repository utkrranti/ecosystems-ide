# Architectural Decision Records (ADR)

Log of significant technical and product decisions. Add a new ADR before implementing anything that is hard to reverse.

---

## ADR Template

Copy this block for each new decision:

```markdown
## ADR-XXX: Title

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-YYY  
**Date:** YYYY-MM-DD  
**Deciders:** names/roles  

### Context
What problem or choice forced a decision?

### Decision
What we chose.

### Consequences
**Positive:** …  
**Negative:** …  
**Neutral:** …
```

---

## ADR-001: Base Platform — Code-OSS Fork

**Status:** Accepted  
**Date:** 2026-05-30  
**Deciders:** Product + Architecture  

### Context

We need a VS Code–class IDE quickly with extension compatibility, LSP, debug, and terminal. Greenfield options (Tauri + Monaco, native) would delay parity by years.

### Decision

Fork **Code-OSS** (MIT) as the application base. Inject Altus AI as first-party services under `src/vs/platform/ecosystems/ai/` and register UI via `src/vs/workbench/contrib/ecosystems/`.

### Consequences

**Positive:** Fastest path to feature parity; inherit Monaco, LSP, DAP, extension host.  
**Negative:** Ongoing merge effort with upstream; must comply with OSS attribution.  
**Neutral:** Branding and distribution are separate from “VS Code” trademark.

---

## ADR-002: AI Placement — Core Services

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

AI can be implemented as a VS Code extension only, or as core platform services.

### Decision

Implement AI as **core platform services** (context, router, agent, inline) with UI in first-party webviews. Extensions may *extend* AI via API later, not replace the core.

### Consequences

**Positive:** Unified context, keychain access, consistent UX, no extension host limits for agent tools.  
**Negative:** More code in the main fork; harder to disable AI entirely without build flag.  
**Neutral:** May still ship thin extension wrappers for marketplace discovery later.

---

## ADR-003: Context Strategy — Hybrid Retrieval

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Pure RAG misses exact symbols; pure LSP misses cross-file semantic similarity.

### Decision

**Hybrid context:** LSP symbols + ripgrep + git/diagnostics first; optional vector embeddings (SQLite/LanceDB) for large workspaces in Phase 2.

### Consequences

**Positive:** Works offline without embeddings; predictable behavior for small repos.  
**Negative:** Embedding pipeline adds complexity in Phase 2.  
**Neutral:** Token budget allocator required in all cases.

---

## ADR-004: Agent Writes — Staged Diffs Only

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Autonomous file writes erode trust and cause irreversible damage.

### Decision

Default agent behavior: **propose edits as diffs**; user accepts per hunk or file. Checkpoints before each agent run. Opt-in “auto-apply” for trusted workspaces only (future setting).

### Consequences

**Positive:** Aligns with trust pillar; easier enterprise adoption.  
**Negative:** Slower than fully autonomous agents.  
**Neutral:** Power users may want auto-apply — document risks clearly.

---

## ADR-005: Extensions — Subset First

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Full VS Code marketplace compatibility is a large testing and security surface.

### Decision

Launch with **curated extension allowlist** (themes, formatters, popular LSP helpers). Expand compatibility in Phase 3 with a published compatibility matrix.

### Consequences

**Positive:** Controlled security review; smaller QA scope.  
**Negative:** Users may miss niche extensions early.  
**Neutral:** Document migration path from VS Code.

---

## ADR-006: Data — Local-First Indexing

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Enterprises and privacy-conscious users require code to stay on machine.

### Decision

Workspace index and embeddings stored **locally** by default. Cloud indexing only with explicit opt-in. “Local only” mode disables all cloud LLM calls.

### Consequences

**Positive:** Strong privacy story; air-gapped support.  
**Negative:** Local embedding quality depends on user hardware.  
**Neutral:** Cloud sync of *settings/rules* may come later without code upload.

---

## ADR-007: Desktop Shell — Electron (v1)

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Tauri and native shells offer size/performance benefits but break alignment with Code-OSS.

### Decision

Use **Electron** for v1 (inherited from Code-OSS). Revisit Rust sidecar for indexing in Phase 3; do not rewrite shell until product-market fit.

### Consequences

**Positive:** Zero shell migration cost at start.  
**Negative:** Larger install size and memory vs Tauri.  
**Neutral:** Optional perf work without changing user-facing shell.

---

## ADR-008: Chat UI — Vanilla Webview (Phase 0)

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Chat sidebar can be built with React, Svelte, or vanilla TS in a VS Code webview. React adds bundle size and build complexity for Phase 0.

### Decision

Phase 0 chat UI uses **vanilla TypeScript + CSS** in the webview, themed with VS Code CSS variables. Revisit React in Phase 1 if UI complexity (context picker, diff cards) justifies it.

### Consequences

**Positive:** No separate webview bundler; faster initial ship; smaller payload.  
**Negative:** Manual DOM updates; harder component reuse at scale.  
**Neutral:** Message protocol unchanged regardless of UI framework.

---

## ADR-009: Default Cloud Provider — OpenAI-Compatible BYOK

**Status:** Superseded by [ADR-011](#adr-011-inbuilt-ai-via-ecosystems-gateway)  
**Date:** 2026-05-30  

### Context

Phase 0 needs one default inference path. Options: OpenAI native, Anthropic native, or OpenAI-compatible abstraction.

### Decision (historical)

Default provider was **OpenAI-compatible API** with user **bring-your-own-key**.

### Consequences

Superseded — product direction is **inbuilt AI** via Altus AI Gateway (ADR-011). BYOK is not offered to end users in Phase 0+.

---

## ADR-011: Inbuilt AI via Altus AI Gateway

**Status:** Accepted  
**Date:** 2026-05-31  

### Context

Altus IDE must ship **built-in AI** like a product (not a thin client where users paste provider API keys). Users sign in / hold a license; EcoSystems operates upstream model access, billing, and quotas.

ADR-009 (BYOK) was rejected for the consumer product.

### Decision

All cloud AI from the desktop IDE flows through the **Altus AI Gateway**:

```
IDE → Model Router → Altus AI Gateway (user session / license)
                              ↓
                    OpenAI / Anthropic / etc. (EcoSystems keys — server-side only)
```

**Rules:**

1. **No user-supplied LLM API keys** in Settings or keychain for Phase 0 consumer builds.
2. **Default provider** in the model router is `ecosystems` (gateway client), not direct OpenAI.
3. **Provider keys** live only on the gateway; never shipped in the IDE or webview.
4. **Auth:** user session token or license JWT issued by EcoSystems accounts service; stored via `ISecretsService` (OS keychain) as **session credentials**, not `sk-...` keys.
5. **Model list** is curated by gateway + plan tier; IDE exposes allowed models in Settings dropdown.
6. **Local dev:** gateway may run at `http://localhost:8080` with team dev keys on the server only.

### Consequences

**Positive:** Unified product UX; EcoSystems controls cost, abuse, and model policy; simpler user onboarding.  
**Negative:** Requires gateway + accounts/billing before production AI; Altus AI pays upstream providers.  
**Neutral:** Model router abstraction unchanged; only the default provider and auth model change. Enterprise BYOK may be revisited as a **separate tier** in Phase 3+, not the default.

---

## ADR-010: Repository Strategy — Single Monorepo

**Status:** Accepted  
**Date:** 2026-05-30  

### Context

Altus IDE could be split across multiple repositories (editor fork, AI platform, extensions, docs, cloud API) or kept in one monorepo. The product is a **desktop application** with in-process AI; cloud inference goes through the **Altus AI Gateway** (ADR-011), implemented in the sibling Go project `ide_apis/` (local dev via `scripts/run-all.ps1`, production at `https://chat.altuside.com/v1`).

### Decision

Use a **single git repository** (`ecosystems/ide`) containing:

- Code-OSS fork + EcoSystems code (`src/vs/platform/ecosystems/`, `src/vs/workbench/contrib/ecosystems/`)
- Documentation (`docs/`)
- Tests (`test/`)
- First-party extensions (`extensions/ecosystems-*`)
- CI and build scripts (`.github/`, `scripts/`)

**Remotes:** `origin` (EcoSystems) + `vscode-upstream` (read-only) — not separate product repos.

Separate repositories are deferred until a distinct deployable service is required (e.g. cloud team API, marketplace backend in Phase 3+).

### Consequences

**Positive:** Simple fork/sync with upstream; one CI pipeline; atomic PRs across AI + workbench; matches Code-OSS layout.  
**Negative:** Large clone (~GB after fork); repo history includes upstream bulk.  
**Neutral:** Optional satellite repos (website, benchmark fixtures) may be added without changing the core product repo.

---

## Pending ADRs

| ID | Topic | When needed |
|----|-------|-------------|
| ADR-012 | Gateway API contract (OpenAPI) | Epic E2 |
| ADR-013 | Update channel & code signing | Phase 0 packaging |
| ADR-014 | Telemetry schema (if any) | Phase 1 |
| ADR-015 | Extension API surface for AI context | Phase 2 |
