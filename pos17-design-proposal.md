# POS-17 Design Proposal: Production-Ready Multilingual Content Studio

## Executive Summary

The current UI reads as a developer prototype: AI provider dropdowns are exposed in the main flow, the language selector treats multilingual as a single-choice filter (undermining the product's entire value prop), and the visual treatment is a plain form on white. This document covers (1) comprehensive user research on multilingual social posting, (2) a core UX redesign centered on simultaneous multi-language generation, and (3) specific visual polish changes.

---

## Part 1 — User Research

### How people post multilingual content today

**LinkedIn**
- Most users with multilingual audiences post in their primary language, then rely on LinkedIn's built-in auto-translation ("See Translation" link). This is the lowest-friction path.
- Power users who want full control post **separately per language** with ≥8 hours gap between posts — not as a mixed-language single post (mixed-language posts reduce engagement and feel cluttered).
- Company pages (≥300 followers) get LinkedIn's language-targeting feature — post once in one language, set a target language audience. Personal profiles do not have this.
- **Pain point**: Creating separate per-language posts means 3× the writing effort. Users either accept lower reach (post in one language only) or pay for translation/rewriting services.

**X / Twitter**
- 280-character limit makes bilingual posts nearly impossible in a single tweet.
- Users either post threads (tweet 1 in English, tweet 2 in German) or post separate, unlinked tweets.
- Most global users default to English only to maximize reach, sacrificing their native audience.

**小红书 (Xiaohongshu)**
- Almost exclusively Chinese-language. Foreign users creating content for the Chinese market must fully localize — not just translate (different slang, emoji style, tone, hashtag format).
- Content is discovery-driven (lifestyle + product), not distribution-driven. Cultural fluency matters more than on LinkedIn/X.

### Core user pain point

> "I want to write a post about X and have it ready in all the languages my audience speaks — for each platform I use — without doing this 3× or paying a translator."

The current tool solves the platform-fan-out well (3 platforms in parallel) but still forces **3 separate generation cycles** for 3 languages. For a user who posts to LinkedIn + X in English + German, that's 4 manual runs (2 platforms × 2 languages) today. With the proposed multi-language multi-select, it becomes 1 run producing 4 cards simultaneously.

### User flow (current vs. proposed)

**Current flow** — 1 language at a time:
1. Paste source → pick English → pick platforms → Generate → review 3 cards
2. Switch to German → Generate again → review 3 more cards
3. Copy/paste into platforms manually, 6 separate operations

**Proposed flow** — all languages at once:
1. Paste source → select languages (EN + DE checkboxes) → select platforms → Generate
2. 6 cards stream simultaneously (2 languages × 3 platforms)
3. Review inline, copy whichever cards you want to publish
4. Done in one pass

### Competitive context

Tools like Buffer, Hootsuite, and Planable are converging on "AI-generated variations per language AND per platform simultaneously." This is the direction the market is moving. The Multilingual Content Studio's per-platform structured streaming is technically ahead; the UX is behind.

---

## Part 2 — Core UX Change: Multi-Language Multi-Select

### The change

Replace the Language **dropdown** (single value) with **toggle chips** — the same interaction pattern already used for Platforms.

```
Languages                           Platforms
[● English] [● Deutsch] [○ 中文]    [● LinkedIn] [● X / Twitter] [○ 小红书]
```

**Default state**: all 3 languages selected (surfaces full value immediately on first visit).

### Output: the generation matrix

`selected_languages × selected_platforms = N streaming cards`

| Languages selected | Platforms selected | Cards |
|---|---|---|
| EN only | LinkedIn + X | 2 (current behavior) |
| EN + DE | LinkedIn + X | 4 |
| EN + DE + ZH | LinkedIn + X + 小红书 | 9 |

### Card grid layout

Cards group **by platform** (primary), then **by language** (secondary). This mirrors how users actually think when publishing — "what am I posting to LinkedIn today?" — and makes cross-language comparison within a platform trivial.

```
─── LinkedIn ──────────────────────────────────────────────────
[🇬🇧 English]     [🇩🇪 Deutsch]     [🇨🇳 中文]

─── X / Twitter ───────────────────────────────────────────────
[🇬🇧 English]     [🇩🇪 Deutsch]     [🇨🇳 中文]

─── 小红书 ────────────────────────────────────────────────────
[🇬🇧 English]     [🇩🇪 Deutsch]     [🇨🇳 中文]
```

Platform sections collapse when the platform is deselected. Language columns disappear when a language is deselected. A single-language + single-platform selection degrades gracefully to 1 card.

### API impact (server-side: unchanged)

The `/api/generate` route already accepts `{ source, language, tone, provider, model, platform }` — each card is one independent call. Multi-language just means more parallel calls fan out from the client. No backend changes needed. The `request: SharedRequest` type in `page.tsx` already excludes `language` from the shared struct — the per-card `submit()` call just needs to include `language` from the card's identity (not from a single shared state).

---

## Part 3 — Visual Polish

### 3.1 Information architecture

**Current problem**: The page is a flat vertical list. Provider/Model selectors appear above the source input — developer choices are the first thing users see.

**Proposed layout**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER                                                             │
│  [Logo / wordmark]           [● mock]  [⚙ Advanced]               │
├─────────────────────────────────────────────────────────────────────┤
│  INPUT ZONE                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Source text (large textarea, 5 rows, prominent placeholder) │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  Languages: [● EN] [● DE] [○ ZH]    Tone: [Professional ▾]        │
│  Platforms: [● LinkedIn] [● X] [○ 小红书]                          │
│                                                                     │
│  [Generate 6 posts ───────────────────────────────────────→]       │
├─────────────────────────────────────────────────────────────────────┤
│  OUTPUT ZONE (appears after first generation)                       │
│  ─── LinkedIn ───                                                   │
│  [EN card]  [DE card]  [ZH card]                                   │
│  ─── X / Twitter ───                                                │
│  [EN card]  [DE card]  [ZH card]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Advanced ⚙ panel** (collapsed by default): Provider + Model selectors, Metrics panel. Power-user tools, not first-run tools.

### 3.2 Typography + spacing

| Element | Current | Proposed |
|---|---|---|
| Page title | `text-2xl font-bold` | `text-xl font-semibold tracking-tight` in header bar |
| Section labels | `text-xs font-medium text-gray-600` | `text-xs font-semibold uppercase tracking-widest text-gray-400` |
| Card platform header | `text-sm font-semibold` | `text-sm font-semibold` + platform brand color dot |
| Body text | `text-sm` | `text-sm` (unchanged) |
| Page background | `bg-white` | `bg-gray-50` |
| Card background | `bg-gray-50` | `bg-white shadow-sm` |

### 3.3 Color system

Keep black/white/gray as the primary palette (professional, neutral, not trendy). Add:

- **Page background**: `#F9FAFB` (gray-50) — creates depth for white cards
- **Platform accent dots** in card headers (subtle, 8px circle):
  - LinkedIn: `#0A66C2`
  - X/Twitter: `#000000`
  - 小红书: `#FF2442`
- **Language flags** in card headers: emoji flag or 2-letter label chip (`EN`, `DE`, `ZH`)
- **Generate button**: keep black, increase padding, full-width or prominent width
- **Live badge**: `bg-emerald-50 text-emerald-700 border border-emerald-200` (more polished than current)
- **Mock badge**: `bg-amber-50 text-amber-700 border border-amber-200`

### 3.4 Streaming state

| State | Current | Proposed |
|---|---|---|
| Streaming | `animate-pulse text-gray-400 "streaming…"` text | Thin animated progress bar under card header (height: 2px, brand color) |
| Before first token | Empty textarea shows placeholder | Skeleton shimmer on body textarea |
| All generating | No global indicator | `"Generating 6 posts…"` pill near Generate button, disappears when done |
| Done | Nothing | Brief `"✓ 6 posts ready"` confirmation, fades after 3s |

### 3.5 Empty / zero state

Before any generation: the output zone doesn't exist (cards appear only after first Generate). This is fine but the page ends abruptly after the Generate button.

**Proposed**: After the Generate button, show a muted ghost layout:
```
─── LinkedIn ──────────────────────────────────
[  Ghost card — click Generate to stream  ]  [  Ghost card  ]
```
Or simply: a short one-liner below the Generate button:
> `↓ Your posts will stream here, one card per platform × language.`

### 3.6 Copy workflow improvement

Currently: Copy button appears in the card header only after content exists. Small, easy to miss.

**Proposed**: After streaming finishes, each card shows a prominent `Copy for LinkedIn →` CTA at the card footer (full-width button, subtle). The header copy button stays for quick access.

---

## Part 4 — Component Change Map

| Component | Change type | Effort |
|---|---|---|
| `Home` state: `language` | `useState<Language>` → `useState<Language[]>` | S |
| Language selector | `<Select>` dropdown → toggle chips (same as Platforms) | S |
| `SharedRequest` type | Remove `language` | S |
| `PlatformCard` props | Add `language: Language` | S |
| Card grid rendering | `selected.map(p => <Card>)` → `PLATFORMS.filter(selected).map(section)` with language columns | M |
| Card header | Add language label/flag + platform color dot | S |
| Page layout | Add header bar, move Provider/Model to Advanced panel | M |
| `globals.css` | `bg-white` → `bg-gray-50` on body | XS |
| Streaming progress bar | New CSS animation in card | S |
| Generate button | Wording, padding, count reflects `platforms × languages` | S |
| Advanced panel | Wrap Provider + Model + Metrics in `<details>` or collapsible | S |

Total estimated effort: **1–2 days for a focused coder sprint**.

---

## Part 5 — Acceptance Criteria

### Must-have (P0)
- [ ] Language selector is multi-select chip toggles; all 3 selected by default
- [ ] Generating with 2 languages × 3 platforms produces 6 streaming cards simultaneously
- [ ] Each card header shows both the platform name and the language label (e.g. "LinkedIn · EN")
- [ ] Cards are grouped by platform section (LinkedIn section, X section, 小红书 section)
- [ ] Provider/Model selectors are hidden by default behind an Advanced toggle
- [ ] Metrics panel is hidden by default behind Advanced toggle (or removed from main flow)
- [ ] Generate button label reflects total post count (`Generate 6 posts`)

### Should-have (P1)
- [ ] Page background is `gray-50`, cards are white with `shadow-sm`
- [ ] Platform brand color dot in each card header
- [ ] Streaming progress bar (2px animated line) under card header while streaming
- [ ] "All generating" and "All done" global indicators

### Nice-to-have (P2)
- [ ] Ghost/skeleton layout before first generation
- [ ] Prominent per-card footer copy CTA after streaming completes
- [ ] Language flag emoji in card header
