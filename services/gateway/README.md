# EcoSystems AI Gateway (local dev)

Paste your **OpenAI** and **Anthropic** keys here — not in the IDE.

## 1. Paste keys

Edit this file:

```
services/gateway/.env.local
```

```env
OPENAI_API_KEY=sk-...paste-here
ANTHROPIC_API_KEY=sk-ant-...paste-here
DEV_SESSION_TOKEN=dev-local-token
```

Save the file. Never commit it.

## 2. Start gateway

```powershell
cd D:\Projects\EcoSystems\IDE\services\gateway
npm install
npm start
```

## 3. Point IDE at gateway

In EcoSystems IDE settings (`settings.json`):

```json
"ecosystems.ai.gateway.baseUrl": "http://localhost:8787/v1"
```

## 4. Sign in to IDE

Command Palette → **EcoSystems AI: Sign In**

Paste: `dev-local-token` (same as `DEV_SESSION_TOKEN` in `.env.local`)

## 5. Chat

Open **EcoSystems AI** sidebar and send a message.

| Model | Provider |
|-------|----------|
| `gpt-4o-mini`, `gpt-4o` | OpenAI key |
| `claude-3-5-sonnet-20241022` | Anthropic key |
