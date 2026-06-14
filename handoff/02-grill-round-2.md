# Round 2 — resolved

## Q2.1 — Onboarding
**Chosen: combined screen — category chips + trending carousel.**

Layout:
- **Top**: 8–12 category chips, sourced from a small static list of well-known
  DW categories (Politics, Tech, Climate, Business, Science, Culture, Sports,
  Health, Travel, plus regional buckets like Europe, Americas, Asia, Africa,
  Middle East).
- **Bottom**: a horizontally scrollable carousel of ~10 cards from
  `most-viewed` (EN, MVP). User taps any that look interesting.
- **Mandatory**: at least one chip OR one card before "Start". Otherwise the
  feed has zero seed.

### Data routing of the onboarding signals
- **Chip pick (category)** → seeds future `trending_by_category` calls with that
  category name/originId.
- **Chip pick (region)** → seeds `trending_by_region` calls.
- **Card tap (article)** → adds the content_id to a `seed_likes` list used by
  `similar` (and later `similar_for_content_by_user`).

This makes onboarding signals first-class inputs to the bandit pool from tap 1.

### Metadata-driven discovery (PM note)
- PEACH runs a **`metadata` task** that ingests every content's CODEX record
  with `categories`, `regions`, `keywords`, `programs`, `genre` (see
  `~/workshop/dw_libs/metadata/task.py`). The SPA does **not** query CODEX
  directly. Instead we use the PEACH endpoints that already expose these
  filters: `trending_by_category`, `trending_by_region`,
  `trending_tz?model_types=...`.
- "Similar" search (`/v2/similar?ids=<id>`) is the second discovery vector and
  uses Qwen3 embeddings server-side.

## Q2.2 — Signal persistence
**Chosen: per-device persistent in localStorage.**

Key `mydw_profile_v1`:
```json
{
  "lang": "ENGLISH",
  "categories": { "Technology": 3.0, "Politics": 1.5 },
  "regions": { "region:europe:DE": 2.0 },
  "seen_ids": ["77527661", "..."],        // capped, FIFO eviction at 500
  "liked_ids": ["77527802"],              // uncapped
  "saved_ids": ["77492750"],              // uncapped, surfaced in "Saved"
  "skipped_ids": ["..."],                 // capped, FIFO at 200
  "last_seed_id": "77527802",             // most recent positive signal
  "streak": { "current": 4, "last_day": "2026-06-14" }
}
```
- Survives reload. Cleared by explicit "Reset profile" button.
- **Long-term aspirations (not MVP)**: send custom PEACH events from a
  dedicated `my.dw.com` sitekey so the global `user_history` endpoint can
  exclude already-seen content across devices. PoC stays local.

## Q2.3 — Language mixing (correction to my Round 1 framing)
**Same article never has a cross-language twin in DW** — each language
version has its own content_id, and topical coverage diverges intentionally.
So the original "read this in DE" chip on the *same* article doesn't exist
in DW's data model. Update:

**Multilingual mix** instead of language-jump:
- When the user marks ≥2 languages in onboarding (or v1.1 picks via the
  browser-language modal), the feed pool **interleaves PEACH results across
  those languages**.
- Each card shows its language as a small badge (e.g. "EN" / "ES").
- This serves the "discover what's missing in your main language" angle: an
  English-only reader who also reads Spanish gets stories that DW Spanish is
  covering but DW English isn't.
- **MVP**: single language (EN). The architecture supports multi-language
  from day 1 (pool just unions per-language results), but the UI for picking
  languages ships in v1.1.

## Q2.4 — Card content
**Chosen: a + c (no "why am I seeing this?" line in MVP).**

A card renders:
- Full-bleed `mainContentImage.staticUrl` (with `${formatId}` resolved to
  e.g. `940`; pattern visible in `metadata/task.py`).
- Kicker (`roadTeaserKicker`).
- Title.
- Summary (`shortTeaser` if present, else `teaser`). Hard-trim to ~280 chars
  to enforce "summary first".
- Meta line: language badge · contentDate (relative) · `formattedDurationInMinutes`
  for VIDEO/AUDIO.
- Floating actions: Like, Save, Read more, Next.

"Why am I seeing this?" is **deferred** because reliable provenance per pool
source isn't free — and getting it wrong would undermine the demo. Revisit
once the bandit logs source per card.

## Q2.5 — Read more behaviour
**Chosen: push to a detail view inside the SPA**, with hard caveats.

- Route: `/article/:contentId?lang=ENGLISH` (SPA route, no SSG, hydrated from
  the same GraphQL content query).
- Renders: title, kicker, main image, author/date, **sanitised body**.
- **HTML sanitisation strategy for `text`** (the body field):
  - Keep: `<p>`, `<h2>`, `<ul>`, `<ol>`, `<li>`, `<em>`, `<strong>`, `<blockquote>`, `<figure><img><figcaption>` (using DW static URLs only), plain `<a>` to internal-link DW paths (rewritten to `dw.com` absolute) and external-link href as-is.
  - **Strip unsupported embeds** (declared scope cut, not a bug):
    `<div class="vjs-wrapper embed">` (videos), `<div class="embed dw-widget">`,
    `<span class="rich-text-ad">`, inline social embeds, image galleries.
    Replace each strip with a placeholder "🎞 Embedded content — view on dw.com →"
    linking to the canonical article.
- **Canonical link**: every detail view emits `<link rel="canonical"
  href="https://www.dw.com{namedUrl}">` and a visible "Open original on
  dw.com ↗" button at top and bottom. Sets expectation that the SPA is a
  reading shell, not a replacement.
- Back button returns to the feed at the same card position.

Out of scope for MVP body rendering (explicitly): video player, audio player,
image gallery lightbox, live blog elements, embedded tweets/youtube, ads.

## Q2.6 — Streak
**Chosen: (a) but with "meaningful visit" rule (lite version of b).**

- +1 per calendar day (device-local timezone) **only after the user views ≥3
  cards**. This prevents accidental loads from inflating the streak and
  matches the gameplay loop.
- Miss a day → streak resets to 0.
- No freeze tokens (b/c-style) — too much UI for a PoC.
- Streak is shown as a small flame badge in the header.
