# Future work — post-MVP

Items deliberately cut from MVP. Captured here so they don't reappear as
questions or get re-discovered as gaps.

## FW1 — Dedicated PEACH sitekey for my.dw.com
**Why**: isolates this app's user behaviour from main `dw.com`, enables CF
over a clean, intentional event stream, lets us own the user id.

**Shape**:
- Provisioned sitekey `mydw` (or similar) at PEACH.
- SPA mints a stable per-device UUID v4, persisted in `localStorage`. This is
  our `user_id` going forward.
- Add to `dw_libs.constants.SITEKEY`-style config so endpoints can branch on
  it.

**Unlocks**: FW2, FW3, FW7.

## FW2 — Custom event taxonomy
**Why**: gives PEACH the signals to actually personalize.

Event types (sent to PEACH from the SPA):
| Event              | Trigger                                      |
|--------------------|----------------------------------------------|
| `card_view`        | Card mounts on screen                        |
| `summary_expand`   | Read-more tap                                |
| `read_more_click`  | Detail-view route enter                      |
| `next_skip`        | Next tapped without expand/like              |
| `like`             | Like button tapped                           |
| `unlike`           | Like un-tapped                               |
| `save`             | Save button tapped                           |
| `unsave`           | Removed from /saved                          |
| `language_jump`    | (FW5) language badge tapped                  |
| `discovery_yes`    | Liked a card flagged "Discover"              |
| `discovery_no`     | Skipped a card flagged "Discover"            |

## FW3 — CF in the bandit pool
**Why**: replaces hand-tuned similarity walk with model-based ranking.

With FW1+FW2 in place:
- Add `similar_for_user?user_id=<mydw_id>` at ~25% pool weight.
- Add `collab_filter_duckdb?user_id=<mydw_id>&use_case=feed` at ~15%.
- Drop `most-viewed` to 5%, keep discovery slot.

## FW4 — Saved-as-signal endpoint
**Why**: most apps treat "save" as the strongest positive signal users emit.

Proposal: new PEACH endpoint `/v2/recommended_from_saves?user_id=...`
returning content similar to the user's save corpus (mean embedding,
embedding nearest-neighbour over Milvus). Surfaced inline as a "📌 Pick up
where you left off" card every Nth tap.

## FW5 — Multi-language feed mix
**Why**: same-story-different-language doesn't exist in DW data (each lang
has its own content_id, topical coverage diverges intentionally), but a
multilingual reader gets value from stories DW's other-language newsrooms
cover that their main language doesn't.

**Shape**:
- Onboarding offers a multi-select language picker (default: browser
  language).
- Pool builder unions PEACH calls across selected languages, sorting/dedup
  on merged result.
- Card shows language badge prominently.
- Detail-view fetch uses the card's own `language`, not the user's primary.

## FW6 — Browser-language detection + lang switcher modal
**Why**: matches the `dw.com` webapp UX.

- On first load, read `navigator.language` → map to closest DW language
  (`ENGLISH` fallback).
- Modal: "Read DW in: [DE] [EN] [ES] [TR] [UK] [other languages…]"
- Persist in profile.

## FW7 — `user_history`-based dedup
**Why**: MVP dedups via local `seen_ids` only. With FW1+FW2 we can call
`/v2/user_history?user_id=<mydw_id>&amount=200` to get globally-seen
content and exclude it from pools — survives device reset and roams.

## FW8 — Teacher mode
**User story**: "I'm a teacher and want classroom-ready DW content I can
share with students."

**Proposal**:
- Onboarding toggle. Filters pool to:
  - `model_type=ARTICLE` (no breaking news / liveblog).
  - Prefers articles with `genre: feature` or `genre: analysis`.
  - Boosts regional and Society/Culture/Science content.
- `/saved` gets an "Export as PDF / shareable link" affordance.
- Each card has a "Add to lesson" action (collects into a session bundle).

**Blocker**: requires a `genre` or "lesson-friendly" flag in metadata that
is reliable. Today's `genre` field is sparse.

## FW9 — Language-learner mode
**User story**: "I'm B1 German and want news I can actually read."

**Proposal**:
- Onboarding asks: "Are you learning a language?" → pick language + level
  (A2 / B1 / B2 / C1).
- DW already produces dedicated learner content (Deutsch lernen, etc.)
  under a separate stream. Surface that stream alongside regular content.
- Crude client-side complexity score on `text` (avg sentence length, word
  rarity) as a secondary filter.

**Blocker**: learner content isn't exposed via the partner endpoints we
have. Needs a content-stream identifier (`sitekey` or `app_name`) lookup.

## FW10 — "Why am I seeing this?" attribution
**Why**: lifts the "it learns" demo moment from implicit to explicit.

**Shape**: tag each pool candidate with its source at fetch time. On
render, show a tiny line: "Because you liked [Article X]" / "Trending in
Germany" / "🎲 Discover". Stays visible only on hover/tap-to-reveal so it
doesn't clutter the card.

Deferred because reliable provenance per merged candidate adds complexity
to the pool builder and the wrong copy can hurt trust.

## FW11 — Dynamic chip taxonomy
**Why**: MVP ships a static category list that may drift from DW's actual
newsroom focus.

**Shape**: on first onboarding load, fetch `most-viewed?amount=50`, GraphQL
each card for `categories[]` / `regions[]`, count frequencies, render top
12 chips. Cache in localStorage for 24h. Falls back to static list on
failure.

## FW12 — Cross-device sync via QR
**Why**: device-bound profile feels like a regression once people use the
app on phone + laptop.

**Shape**: settings page → "Sync to another device" → renders a QR encoding
a profile JSON snapshot. Scanning device replaces its profile. No auth, no
backend.

## FW13 — Embedded video / audio / liveblog rendering
**Why**: MVP strips them with a placeholder. Honest cut but limits UX for
DW's video-heavy content.

**Shape**:
- Detect HLS/MP4 sources in `vjs-wrapper`, render with a lightweight HTML5
  video player (no video.js).
- Image galleries: simple swipeable lightbox.
- Liveblog elements: fetch the parent liveblog and render entries
  reverse-chronologically.

## FW14 — Daily streak freeze tokens
**Why**: MVP resets streak on miss. Real engagement loops use forgiveness
mechanics.

**Shape**: Duolingo-style — 1 freeze token per 7-day streak, max 2. Auto-
consumed on miss.

## FW15 — User-controlled "vibe" chip (Untagger Tier B)
**Why**: MVP uses the untagger to passively learn the user's dimension
preference. A user-facing chip lets the user *choose* their mood.

**Shape**:
- 4-way pill near the top of the feed:
  `Facts | Context | Inspire | Useful`.
- Tap to pin the pool's untagger slot (and optionally raise its weight)
  to one dimension temporarily.
- Untap to go back to the learned mix.
- Pin survives until the user untaps or refreshes.

**Why deferred**: adds UI surface; users may not understand the four
labels without explanation. Worth experimenting once the passive
dimension-learning loop (MVP) has telemetry to compare against.

## FW16 — Time-of-day soft tilt on dimensions (Untagger Tier C)
**Why**: cold-start users have empty `dimension_pref`. A free signal —
local time of day — can softly tilt the random uniform pick.

**Shape**:
- Tilt is **additive** to learned weights, never replaces them. After
  ~5 likes the learned weights dominate the tilt entirely.
- Suggested tilts (tunable):
  - 06:00–11:00 → +20 fact_driven
  - 11:00–18:00 → neutral
  - 18:00–23:00 → +15 emotion_driven, +10 context_driven
  - 23:00–06:00 → +15 context_driven (long-reads at night)

**Why deferred**:
- Hypothesis is *our* opinion, not a measured user preference.
- Plenty of users want hard news at night and would feel the app
  fighting them.
- Hackathon judges hit the app once at one time of day → never see
  the mechanic doing anything different.
- The learned `dimension_pref` from MVP is the honest version of this
  feature.

Consider revisiting once we have analytics from the dedicated sitekey
(FW1) and can A/B the tilt against pure learned weights.
