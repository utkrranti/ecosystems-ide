# Stack playbooks (Agent standard practices)

Altus loads **stack playbooks** at the IDE layer and injects them into every Agent system prompt. Each playbook defines official **scaffold commands**, post-scaffold steps, dev-server commands, folder expectations, and pitfalls (e.g. Next.js + Tailwind v4).

## Sources (merge order)

1. **Bundled** — `src/vs/workbench/contrib/ecosystems/common/stack-playbooks.json` (shipped with the IDE)
2. **Local override** — `ecosystems.ai.stackPlaybooks.localPath` (JSON file, merged by `id`)
3. **Remote** — `ecosystems.ai.stackPlaybooks.remoteUrl` (HTTPS JSON, cached under user data, merged by `id`)

Later sources override earlier ones for the same stack `id`.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ecosystems.ai.stackPlaybooks.enabled` | `true` | Inject playbooks into Agent prompts |
| `ecosystems.ai.stackPlaybooks.remoteUrl` | *(empty)* | URL to hosted `stack-playbooks.json` |
| `ecosystems.ai.stackPlaybooks.localPath` | *(empty)* | Absolute path to a local JSON file |

Example `settings.json`:

```json
{
  "ecosystems.ai.stackPlaybooks.remoteUrl": "https://your-cdn.example.com/ecosystems/stack-playbooks.json"
}
```

Remote fetch runs when Agent mode initializes (and when settings change). On failure, the last cached copy in `%APPDATA%/Altus IDE/.../stack-playbooks.remote.json` is used.

## JSON schema

```json
{
  "version": 1,
  "updated": "2026-06-02",
  "stacks": [
    {
      "id": "nextjs",
      "name": "Next.js (App Router)",
      "aliases": ["next.js", "next"],
      "detect": { "files": ["next.config.ts"], "packageDeps": ["next"] },
      "scaffoldCommand": "npx create-next-app@latest . --yes ...",
      "postScaffold": ["npm install"],
      "devServer": { "command": "npm run dev", "background": true },
      "forbiddenWhenExists": ["create-next-app"],
      "folderStructure": "app/, public/, ...",
      "pitfalls": ["..."]
    }
  ]
}
```

Required per stack: `id`, `name`, `scaffoldCommand`.

## Hosting playbooks on your server

1. Publish the same JSON schema at a stable HTTPS URL.
2. Set `ecosystems.ai.stackPlaybooks.remoteUrl` in the IDE or enterprise policy.
3. Bump `version` / `updated` when you change commands; clients merge on next Agent session.

Bundled playbooks remain the offline fallback.

## Bundled stacks (initial set)

Next.js, Vite+React, Django, FastAPI, Spring Boot, .NET, Go, Rust, Laravel, Rails, Flutter.

To add a stack, edit `stack-playbooks.json` or supply an override file — no code change required unless you add new prompt formatting.
