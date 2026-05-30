# Prompt Data Policy

What data EcoSystems IDE **collects, processes, stores, and transmits** when AI features are used.

**Audience:** Users, security reviewers, legal  
**Phase:** 0 (updated each phase)  
**Last updated:** 2026-05-30  

---

## 1. Summary (User-Facing)

When AI is **enabled** and you use inline completion or chat:

- **Your code and messages are sent to the LLM provider you configure** (e.g. OpenAI) using **your API key**.
- **EcoSystems does not operate a cloud backend in Phase 0** — there is no EcoSystems server receiving your prompts.
- **We do not store prompts on EcoSystems servers** (none exist in Phase 0).
- **Chat history** is kept **locally in the current session** only (Phase 0); not synced.
- You can **turn off AI entirely** in settings — no LLM network calls will be made.

> **Important:** Your LLM provider’s privacy policy applies to data they receive. Review their terms before use.

---

## 2. Data Classification

| Class | Examples | Stored locally | Sent to LLM | Sent to EcoSystems |
|-------|----------|----------------|-------------|-------------------|
| **User code** | Open files, selections | Yes (on disk) | Yes, when AI used | No |
| **User messages** | Chat input | Session memory | Yes | No |
| **API keys** | OpenAI key | OS keychain | To provider auth header only | No |
| **Paths** | `src/app.ts` | Yes | Yes (relative paths) | No |
| **Diagnostics** | Errors, warnings | Yes | No (Phase 0) | No |
| **Git data** | Diff, commits | Yes | No (Phase 0) | No |
| **Terminal output** | Build logs | Yes | No (Phase 0) | No |
| **Telemetry** | Usage events | No (Phase 0) | No | No |

---

## 3. What Is Sent — By Feature (Phase 0)

### 3.1 Inline completion

| Data element | Included | Notes |
|--------------|----------|-------|
| Text before/after cursor (~100 lines) | Yes | Truncated to token budget |
| Language ID | Yes | e.g. `typescript` |
| Relative file path | Yes | e.g. `src/utils.ts` |
| Full workspace | No | |
| Other open files | No | |
| API key | Header only | Not in prompt body |

### 3.2 Chat with `@currentFile`

| Data element | Included | Notes |
|--------------|----------|-------|
| User message | Yes | |
| Active file content OR selection | Yes | Selection if non-empty; else full file up to cap |
| System prompt | Yes | IDE instructions; no user PII |
| Conversation history | Yes | Current session thread |
| Workspace index | No | Phase 1 |
| Git state | No | Phase 1 |

---

## 4. Token & Size Limits (Phase 0)

| Limit | Value | Behavior when exceeded |
|-------|-------|------------------------|
| Max file slice (inline) | 8 KB around cursor | Truncate; prefer lines near cursor |
| Max file (chat attach) | 100 KB | Truncate with UI notice |
| Max chat history turns | 20 | Drop oldest turns |
| Max request timeout | 60 s | Cancel; show error |

Configurable in Phase 1 via `docs/architecture/settings-schema.md`.

---

## 5. Storage & Retention

| Data | Location | Retention (Phase 0) |
|------|----------|---------------------|
| API key | OS keychain | Until user deletes |
| Chat messages | In-memory / webview state | Until app close |
| Completion cache | None | Not persisted |
| Prompt logs | None | Not persisted |
| Crash dumps | Local (Electron default) | User-controlled; keys redacted |

**Phase 1 additions:** Optional local prompt audit log (opt-in, user-controlled export/delete).

---

## 6. Third-Party Processors

| Processor | Role | User controls |
|-----------|------|---------------|
| **LLM provider** (user-selected) | Inference | API key, model, disable AI |
| **GitHub** (CI only, dev) | Build | Not user data in Phase 0 product |

No analytics SDK in Phase 0.

---

## 7. User Controls

| Control | Setting key (planned) | Default |
|---------|----------------------|---------|
| Enable AI | `ai.enabled` | `true` after key set |
| Provider | `ai.provider` | `openai` |
| Model (chat) | `ai.chat.model` | `gpt-4o-mini` |
| Model (inline) | `ai.inline.model` | `gpt-4o-mini` |
| Custom base URL | `ai.provider.baseUrl` | Provider default |

**Local-only mode** (disables all cloud LLM): Phase 2 with Ollama.

---

## 8. Prohibited Data in Prompts (Policy)

EcoSystems IDE **must not intentionally add** to prompts:

- Raw API keys or keychain contents
- Contents of known credential files (Phase 1: enforce via scanner)
- EcoSystems-internal build secrets

**Phase 0 gap:** Secret filenames (`.env`, `*.pem`, `id_rsa`) show a **warning banner** when attached to chat; sending is not blocked until Phase 1.

---

## 9. Enterprise & Compliance Notes

| Topic | Phase 0 status |
|-------|----------------|
| GDPR | No EcoSystems processing of personal data; user is controller for LLM submissions |
| HIPAA | Not certified; do not use with PHI without BAA with LLM provider |
| SOC 2 | N/A — no EcoSystems backend |
| Data residency | Determined by LLM provider region user selects |
| Air-gapped | AI disabled without local model (Phase 2) |

---

## 10. Incident Response

If a vulnerability causes unintended data disclosure:

1. Disable AI via emergency setting or release patch
2. Notify users within 72 hours if EcoSystems code caused leak to non-LLM party
3. Post-mortem in `docs/security/` with timeline and fix

LLM provider breaches: direct users to provider advisories.

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-30 | Initial Phase 0 policy |

---

## 12. Related Documents

- [threat-model.md](./threat-model.md)
- [secrets-and-keychain.md](./secrets-and-keychain.md)
- [PRD v1 Phase 0](../product/PRD-v1-phase0.md)
