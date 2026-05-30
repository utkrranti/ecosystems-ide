# Branding & Trademark Guidelines

How to name, design, and market **EcoSystems IDE** without conflicting with **Visual Studio Code** or **Microsoft** trademarks.

**Last updated:** 2026-05-30

---

## 1. Product Identity

| Field | Value |
|-------|-------|
| **Product name** | EcoSystems IDE |
| **Short name** | EcoSystems |
| **Application ID** | `ecosystems-ide` |
| **Data folder** | `.ecosystems-ide` |
| **User-facing tagline** | *VS Code-class editor with native AI* |

**Never use as product name:**

- Visual Studio Code
- VS Code (as our product name)
- Code (standalone)
- Microsoft IDE

---

## 2. Acceptable References to VS Code

| Context | OK? | Example |
|---------|-----|---------|
| Technical comparison | ✅ | "Built on Code-OSS, the open-source base of Visual Studio Code" |
| User migration docs | ✅ | "Import your VS Code settings" (Phase 1) |
| Implying Microsoft product | ❌ | "EcoSystems VS Code" |
| Logo mashup | ❌ | VS Code icon + our badge |
| "Official" association | ❌ | "Microsoft-approved" |

**Required disclaimer** (website, README, About):

> EcoSystems IDE is an independent product. It is not Microsoft Visual Studio Code, is not endorsed by Microsoft, and is not affiliated with Microsoft Corporation.

---

## 3. Visual Identity

### Logo & icon

| Asset | Spec |
|-------|------|
| App icon | **Original** design — do not modify Microsoft VS Code icon |
| Activity bar AI icon | Original sparkle/chat motif |
| Colors | May use VS Code theme tokens in UI; marketing palette separate |

**Icon files (after design):**

```
resources/
├── icons/ecosystems-ide.ico      # Windows
├── icons/ecosystems-ide.icns     # macOS
└── icons/ecosystems-ide.png      # Linux / marketing
```

### `product.json` branding

```json
{
  "nameShort": "EcoSystems IDE",
  "nameLong": "EcoSystems IDE",
  "applicationName": "ecosystems-ide",
  "dataFolderName": ".ecosystems-ide",
  "win32MutexName": "ecosystemside",
  "darwinBundleIdentifier": "com.ecosystems.ide"
}
```

---

## 4. Microsoft Trademarks (Do Not Use)

Without written permission, do **not** use in product name, domain, or logo:

- Visual Studio®
- VS Code®
- Microsoft®
- Windows® (except factual "Runs on Windows")
- Microsoft logo

**Factual use OK:** "Compatible with many VS Code extensions" (Phase 3, with compatibility matrix).

---

## 5. EcoSystems Trademark

| Item | Phase 0 action |
|------|----------------|
| Register "EcoSystems IDE" | TBD — legal counsel |
| Domain | TBD (e.g. `ecosystems.dev`) |
| GitHub org | `github.com/ecosystems/ide` |

Until registered, use ™ in marketing optionally: EcoSystems IDE™.

---

## 6. In-App Branding

| Location | Content |
|----------|---------|
| Window title | `EcoSystems IDE` |
| About dialog | EcoSystems name, version, link to OSS notices |
| Splash / welcome | EcoSystems logo (when available) |
| Settings | "EcoSystems AI" section (not "Copilot" or "VS Code AI") |

### About dialog must include

- EcoSystems IDE version
- Code-OSS base version / commit (optional)
- Link to open source licenses
- Independence disclaimer (short form)

---

## 7. Marketing & Documentation

### Allowed

- "VS Code-like experience"
- "Fork of Code-OSS"
- "AI-native IDE"
- Screenshots of **our** branded app

### Not allowed

- Microsoft or VS Code logo in our marketing hero
- "Better VS Code" with Code logo
- App Store listing category implying official Microsoft product

---

## 8. Extension Marketplace (Future)

Phase 3 — when referencing VS Code marketplace:

> Extensions published for Visual Studio Code may work in EcoSystems IDE. EcoSystems is not affiliated with the Visual Studio Code marketplace or Microsoft.

---

## 9. AI Feature Naming

| Use | Avoid |
|-----|-------|
| EcoSystems AI | GitHub Copilot (we are not Copilot) |
| Inline completion | "Copilot-style" in product UI (OK in docs only) |
| Chat | Claude/GPT as **provider names** in settings only |

---

## 10. Design Review Checklist

Before any public release:

- [ ] App icon is original (not VS Code blue icon)
- [ ] Product name is "EcoSystems IDE" everywhere in UI
- [ ] About dialog has OSS link + independence note
- [ ] Website/README has disclaimer
- [ ] No Microsoft logos in repo `resources/`
- [ ] `product.json` uses EcoSystems identifiers

Gate: [sign-off.md](../program/sign-off.md) A19.

---

## 11. Related Documents

- [oss-attribution.md](./oss-attribution.md)
- [repo-layout.md](../architecture/repo-layout.md) — product.json
- [01-product-vision.md](../01-product-vision.md)
