# Secrets & API Key Handling

How Altus IDE stores, accesses, and protects credentials.

**Last updated:** 2026-05-30

---

## 1. Principles

1. **Never store secrets in plain text** on disk or in user settings JSON.
2. **Never log secrets** — not in console, crash reports, or telemetry.
3. **Minimize secret lifetime in memory** — load on demand, clear references after use.
4. **Extensions cannot access AI API keys** in Phase 0.

---

## 2. What Qualifies as a Secret

| Type | Example | Storage |
|------|---------|---------|
| LLM API key | `sk-...` | OS keychain |
| Custom provider token | Bearer tokens | OS keychain |
| Future: GitHub PAT for AI tools | `ghp_...` | OS keychain (Phase 2) |

**Not stored by IDE:** User's git credentials (handled by OS/git credential manager).

---

## 3. Keychain Implementation

**Library:** `keytar` (same pattern as VS Code)

**Service name:** `ecosystems-ide`

**Account keys:**

| Account key | Purpose |
|-------------|---------|
| `ai.provider.openai.apiKey` | OpenAI API key |
| `ai.provider.anthropic.apiKey` | Anthropic key (Phase 1) |
| `ai.provider.custom.apiKey` | Custom OpenAI-compatible endpoint |

### Read flow

```
Settings UI → user enters key → validate format (non-empty, prefix check)
  → keytar.setPassword(service, account, key)
  → settings store only: { "ai.provider.openai.keyStored": true }
```

### Use flow

```
Model router needs auth
  → keytar.getPassword(service, account)
  → attach Authorization header
  → do not persist in request logs
```

### Delete flow

```
User clears key in settings
  → keytar.deletePassword(service, account)
  → keyStored flag false
```

---

## 4. Settings Schema (Secret References)

Settings JSON may contain **metadata only**:

```json
{
  "ai.enabled": true,
  "ai.provider": "openai",
  "ai.openai.keyConfigured": true,
  "ai.chat.model": "gpt-4o-mini"
}
```

**Forbidden in settings:**

```json
{
  "ai.openai.apiKey": "sk-..."   // NEVER
}
```

---

## 5. Logging & Redaction

All log sinks apply redaction patterns before write:

| Pattern | Replacement |
|---------|-------------|
| `sk-[A-Za-z0-9]{20,}` | `[REDACTED_OPENAI_KEY]` |
| `Bearer [A-Za-z0-9._-]+` | `Bearer [REDACTED]` |
| `-----BEGIN.*PRIVATE KEY-----` | `[REDACTED_PEM]` |

**Unit test:** Log sample prompt with fake key → assert output contains no raw key.

---

## 6. Export / Sync / Backup

| Action | Secret behavior |
|--------|-----------------|
| Settings sync (future) | Never sync keys; sync `keyConfigured` only |
| Settings export | Strip all `*Key*`, `*Token*`, `*Secret*` fields |
| Workspace export | No keys included |

---

## 7. UI Requirements

- Password-style input for API key field (masked)
- “Test connection” button validates key without displaying it
- Show **configured** badge, not key value
- Link to prompt data policy in same settings section

---

## 8. Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Key in crash dump | Redact in crash reporter config |
| Key in devtools | Webview cannot access keychain |
| Memory scrape | Short-lived strings; no global singleton cache of raw key |
| Malware on machine | OS keychain encryption; out of scope for app-level defense |

---

## 9. Platform Notes

| OS | Keychain backend |
|----|------------------|
| Windows | Credential Manager |
| macOS | Keychain Access |
| Linux | libsecret (GNOME) / kwallet (KDE) |

Document Linux desktop environment requirements in `docs/dev/setup.md`.

---

## 10. Phase 1 Additions

- Secret scanner for prompt content (not keychain — see threat model I3)
- Rotated key support without restart
- Enterprise: environment variable override `ECOSYSTEMS_AI_API_KEY` for CI/automation (never commit)

---

## 11. Acceptance Tests

- [ ] Set key → restart app → completion works
- [ ] Export settings → no `sk-` in file
- [ ] Grep logs after 100 AI requests → no key material
- [ ] Clear key → requests fail with 401 + clear UI message
