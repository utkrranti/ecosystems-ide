# AI Top-up Margin Guide (Multi-user) - Hinglish

Is doc ka use karo decide karne ke liye:

- users ko kitna top-up karwana hai,
- kaunse models expose karne hain,
- aur kitna gross margin rakhna hai.

**Last updated:** 2026-06-02  
**Applies to:** `gpt-4o-mini`, `gpt-4o`, `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-8`

---

## 1) Core margin formula

Har request ke liye:

- `Cost = (InputTokens / 1,000,000 * InputRate) + (OutputTokens / 1,000,000 * OutputRate) + InfraOverhead`
- `GrossMargin% = (SellPrice - Cost) / SellPrice`
- `RequiredSellPrice = Cost / (1 - TargetMargin%)`

Hamesha **fully-loaded cost** use karo (provider + gateway compute + storage + payment fee buffer).

---

## 2) Recommended gross margin targets

Top-up business ke liye yeh achha starting point hai (subscription nahi):

| Model tier | Models | Suggested gross margin |
|---|---|---|
| Budget/default | `gpt-4o-mini`, `claude-haiku-4-5-20251001` | **65% to 80%** |
| Mid-tier quality | `gpt-4o`, `claude-sonnet-4-6` | **50% to 65%** |
| Premium | `claude-opus-4-8` | **35% to 55%** |

Premium models pe margin range lower rakho kyunki per-call volatility zyada hoti hai aur long context spikes se margin slip ho sakta hai.

---

## 3) Practical pricing rule per model

Cost pe per-model multiplier set karo:

- Budget models: `SellPrice = Cost * 3.0` (approx 67% margin)
- Mid-tier models: `SellPrice = Cost * 2.3` (approx 57% margin)
- Premium model: `SellPrice = Cost * 1.8` (approx 44% margin)

Phir safety buffer add karo:

- `+10%` retries/rate-limit waste ke liye
- `+5%` payment + rounding loss ke liye

Final:

- `FinalSellPrice = BaseSellPrice * 1.15`

---

## 4) Top-up credit system (recommended)

UI simple rakho:

- **1 Credit = INR 1**
- Har model ka credit burn per token alag hoga
- Send se pehle estimated credits dikhana (optional, later phase)

### Suggested top-up packs

| Pack | User pays | Credits gets | Effective bonus | Use case |
|---|---:|---:|---:|---|
| Starter | ₹99 | 100 | ~1% | Trial users |
| Growth | ₹299 | 315 | ~5% | Regular users |
| Pro | ₹999 | 1,100 | ~10% | Power users |

Bonus budget-model margin pool se aana chahiye. Premium-heavy usage pe high bonus avoid karo.

---

## 5) Model exposure strategy (important)

Margin protect karne ke liye:

1. `gpt-4o-mini` default rakho.
2. `claude-sonnet-4-6` ko mini se slightly higher credit burn pe rakho.
3. `claude-opus-4-8` ko premium-only rakho (high burn multiplier).
4. Expensive models pe stricter max context/token caps rakho.
5. Thread bahut lamba ho to auto-suggest karo: "start new chat".

---

## 6) Suggested credit burn multipliers

Baseline model lo (`gpt-4o-mini = 1.0x`) aur baaki models scale karo:

| Model | Suggested burn multiplier vs mini |
|---|---:|
| `gpt-4o-mini` | 1.0x |
| `claude-haiku-4-5-20251001` | 1.1x to 1.4x |
| `gpt-4o` | 2.0x to 2.8x |
| `claude-sonnet-4-6` | 2.4x to 3.2x |
| `claude-opus-4-8` | 5.0x to 8.0x |

Isko monthly real usage logs se tune karo.

---

## 7) Monthly guardrails

Har month yeh metrics track karo:

- Blended gross margin (all traffic): target **55%+**
- Premium model spend share: initially **25% se neeche**
- 95th percentile request cost by model
- Retry/rate-limit waste % (target **5% se neeche**)
- Average credits consumed per active user

Agar blended margin 2 weeks tak 50% se neeche rahe:

- premium burn multipliers badhao,
- top-up bonus reduce karo,
- premium model token caps tighten karo.

---

## 8) Fill-in worksheet (apne actual provider rates se replace karo)

| Model | Input rate / 1M | Output rate / 1M | Avg input tokens | Avg output tokens | Infra overhead / req | Cost / req | Target margin | Required sell / req |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-4o-mini | _fill_ | _fill_ | _fill_ | _fill_ | _fill_ | _calc_ | 70% | _calc_ |
| gpt-4o | _fill_ | _fill_ | _fill_ | _fill_ | _fill_ | _calc_ | 58% | _calc_ |
| claude-haiku-4-5-20251001 | _fill_ | _fill_ | _fill_ | _fill_ | _fill_ | _calc_ | 68% | _calc_ |
| claude-sonnet-4-6 | _fill_ | _fill_ | _fill_ | _fill_ | _fill_ | _calc_ | 55% | _calc_ |
| claude-opus-4-8 | _fill_ | _fill_ | _fill_ | _fill_ | _fill_ | _calc_ | 42% | _calc_ |

---

## 9) Quick recommendation (start point)

Agar tumhe abhi launch-ready policy chahiye:

- Default model: `gpt-4o-mini`
- Premium toggle: `claude-sonnet-4-6`, `claude-opus-4-8`
- Burn multipliers: `1.0x / 2.8x / 6.5x` (mini / sonnet / opus)
- Top-up packs: `₹99 / ₹299 / ₹999` with `1% / 5% / 10%` bonus
- Target blended margin: **55% to 65%**

Yeh safe starting band hai; uske baad weekly real token telemetry dekh ke calibrate karo.

