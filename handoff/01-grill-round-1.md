# Round 1 — resolved

## Q1.1 — Demo moments (multiple, ranked)
Three things a viewer should walk away saying. The feed must serve all three
without compromising any:

1. **"TikTok-format actually works for DW content."** — full-screen, summary-first,
   tap-to-next, no scroll-grid.
2. **"Same story, three perspectives across DW languages."** — cross-language
   exploration is a first-class feature, not a settings panel.
3. **"It learned what I care about in 30 seconds without a login."** — fast,
   visible personalisation. Likes and skips have to *visibly* steer the next card.

Implication: don't build a generic feed and hide language-jump in a menu. The
language-jump must be reachable inside the card itself (e.g. "Read this in DE / TR / UK").

## Q1.2 — Persona
**Primary**: Curious multilingual news consumer.
**Co-primary**: Gen Z used to algorithmic feeds (TikTok / Reels mental model).
The two collapse into one design: a feed that *feels* algorithmic and rewards
casual tapping, but exposes language-perspective when curious.

**Long-term tech notes from PM (deferred to backlog, not MVP):**
- New PEACH **sitekey** for `my.dw.com` so events from this app are isolated
  from main `dw.com`. Cleaner training data for the "for you" model.
- **Custom event taxonomy**: `card_view`, `summary_expand`, `read_more_click`,
  `next_skip`, `like`, `save`, `language_jump`. Drives the bandit in v2.
- **`user_history` endpoint** to filter contents the user has already seen
  globally (not just within this app's session). Once we have the dedicated
  sitekey + a stable per-device user_id, we can call it.

## Q1.3 — Languages
**MVP**: English only. Smaller surface, faster to demo, all category variety
exists in EN.
**v1.1 (still PoC scope)**: detect `navigator.language`, offer matching DW
language, fall back to EN. Mirror the `dw.com` webapp language-pick UX
(modal/banner, persisted in localStorage).
**Cross-language**: even in EN-only MVP, we render a "Read in DE / TR / …"
chip when DW content has translations. Day 1 it can be a *static* set of
languages we know DW supports widely; day 2 we wire to the real translations
edge from GraphQL.

## Q1.4 — "Next" semantics
**Hybrid: bandit + similarity walk + visible discovery.**

The next-article picker pulls from a small **candidate pool** assembled per
tap, then picks one and shows it. Pool composition (MVP weights):

| Source                         | Weight | Why                                  |
|--------------------------------|--------|--------------------------------------|
| `similar_for_user` (CF)        | 30%    | "for you" — needs `_pc_c` cookie     |
| `similar` (seeded by last like)| 30%    | local similarity walk                |
| `trending_tz`                  | 20%    | freshness                            |
| `most-viewed`                  | 10%    | popularity baseline                  |
| `trending_by_category`         | 10%    | onboarding category respect          |

Rules:
- **Never repeat** a `content_id` shown in this device's history (localStorage,
  capped at e.g. last 500 ids).
- **Discovery card** every Nth tap (e.g. every 7th) — pulled from a pool the
  user's likes don't influence, badged "Discover". Builds Q1.1.3 narrative.
- **Like** → boost similar-walk weight, seed with this id next time.
- **Skip (= just tap Next without expanding/liking)** → soft negative; reduce
  similar-walk weight for terms/topics on this card next round.
- **Expand "Read more"** → strong positive; counts as 0.5 of a like.
- Weights are **not** trained — they're hand-tuned heuristics. The bandit
  framing is aspirational and goes in the README as "future work". Honest.

## Q1.5 — Deployment / API access
**Live on GitHub Pages.** Probed PEACH endpoint behaviour:
- `Access-Control-Allow-Origin: *` is sent **when an `Origin` header is present**
  (verified). Browser CORS will pass.
- Response time ~60ms from the EU edge. CloudFront-cached.
- Item shape: `{content_id, model_type, language, views}` — only `content_id`
  is needed for our flow; `model_type` lets us optionally branch UI for
  `LIVEBLOG`, `VIDEO`.
- **Required params surfaced during probing**: `trending_tz` requires `timezone`,
  not just `lang`. Add to the endpoint client.
- **No proxy needed.** No backend of our own. SPA → PEACH + GraphQL directly.

Confirmed working endpoints (manually):
- `GET /v2/most-viewed?lang=ENGLISH&amount=N`
- `GET /v2/trending_tz?lang=ENGLISH&timezone=Europe/Berlin&amount=N`
- `GET /v2/similar?ids=<id>&lang=ENGLISH&amount=N` (returns empty for some ids,
  needs investigation per content)
