# Future work — post-MVP

Items deliberately cut from MVP, plus bugs / gaps discovered after MVP
shipped. Captured here so they don't get re-discovered each time.

---

## FW1 — Dedicated PEACH sitekey for my.dw.com

**Why**: isolates this app's user behaviour from main `dw.com`, enables
collaborative filtering over a clean event stream, lets us own the
user id.

**Shape**:
- Provisioned sitekey `mydw` (or similar) at PEACH.
- SPA mints a stable per-device UUID v4, persisted in `localStorage`.
  This is our `user_id` going forward.
- Add to `dw_libs.constants.SITEKEY`-style config so endpoints can
  branch on it.

**Unlocks**: FW2, FW3, FW7.

---

## FW2 — Custom event taxonomy

**Why**: gives PEACH the signals to actually personalise.

Event types (sent to PEACH from the SPA):

| Event              | Trigger                                      |
|--------------------|----------------------------------------------|
| `card_view`        | Card mounts on screen                        |
| `summary_expand`   | Read button tap                              |
| `read_more_click`  | Detail-view route enter (M3)                 |
| `next_skip`        | Next tapped without expand/like              |
| `like` / `unlike`  | Like button toggled                          |
| `save` / `unsave`  | Save button toggled                          |
| `language_jump`    | Language chip toggled mid-session            |
| `discovery_yes/no` | Reaction on a "Discover" card                |

---

## FW3 — Collaborative filtering in the bandit pool

**Why**: replaces the hand-tuned similarity walk with model-based
ranking.

With FW1 + FW2 in place:
- Add `similar_for_user?user_id=<mydw_id>` at ~25% pool weight.
- Add `collab_filter_duckdb?user_id=<mydw_id>&use_case=feed` at ~15%.
- Drop `most-viewed` to 5%, keep a discovery slot.

Blocked today by R7 (`_pc_c` cookie unavailable on `*.github.io`).

---

## FW4 — Saved-as-signal endpoint

**Why**: "save" is typically the strongest positive signal a reader
emits. Today it only feeds the LibrarySheet; the pool doesn't use it.

Proposal: new PEACH endpoint `/v2/recommended_from_saves?user_id=...`
returning content similar to the user's save corpus (mean embedding,
nearest-neighbour over Milvus). Surfaced inline as a "📌 Pick up where
you left off" card every Nth tap.

In the meantime, MVP already feeds **liked** ids into `peach.similar`
(see `lib/pool.ts`). Add saved ids too, with smaller weight — likes are
the stronger signal but saves are still positive.

---

## FW5 — `user_history`-based dedup

**Why**: MVP dedups via local `seen_ids` only. With FW1 + FW2 we can
call `/v2/user_history?user_id=<mydw_id>&amount=200` to get globally-
seen content and exclude it from pools — survives device reset and
roams across devices.

---

## FW6 — Teacher mode

**User story**: "I'm a teacher and want classroom-ready DW content I
can share with students."

**Proposal**:
- Onboarding toggle. Filters pool to:
  - `model_type=ARTICLE` (no breaking news / liveblog).
  - Prefers articles with `genre: feature` or `genre: analysis`.
  - Boosts regional and Society / Culture / Science content.
- `/saved` gets an "Export as PDF / shareable link" affordance.
- Each card has an "Add to lesson" action (collects into a session
  bundle).

**Blocker**: requires a reliable `genre` or "lesson-friendly" flag in
the GraphQL metadata. Today's `genre` field is sparse.

---

## FW7 — Language-learner mode

**User story**: "I'm B1 German and want news I can actually read."

**Proposal**:
- Onboarding asks: "Are you learning a language?" → pick language +
  level (A2 / B1 / B2 / C1).
- DW already produces dedicated learner content (Deutsch lernen, etc.)
  under a separate stream. Surface that stream alongside regular
  content.
- Crude client-side complexity score on `text` (avg sentence length,
  word rarity) as a secondary filter.

**Blocker**: learner content isn't exposed via the partner endpoints we
have. Needs a content-stream identifier (`sitekey` or `app_name`)
lookup.

---

## FW8 — "Why am I seeing this?" attribution

**Why**: lifts the "it learns" demo moment from implicit to explicit.

**Shape**: tag each pool candidate with its source at fetch time. On
render, show a tiny line: "Because you liked [Article X]" / "Trending
in Germany" / "🎲 Discover". Visible only on tap-to-reveal so it
doesn't clutter the card.

Deferred because reliable provenance per merged candidate adds
complexity to the pool builder and the wrong copy can hurt trust.

---

## FW9 — Dynamic chip taxonomy

**Why**: MVP ships a static category list that may drift from DW's
actual newsroom focus.

**Shape**: on first onboarding load, fetch `most-viewed?amount=50`,
GraphQL each card for `categories[]` / `regions[]`, count frequencies,
render top 12 chips. Cache in localStorage for 24h. Falls back to
static list on failure.

---

## FW10 — Cross-device sync via QR

**Why**: device-bound profile feels like a regression once people use
the app on phone + laptop.

**Shape**: settings page → "Sync to another device" → renders a QR
encoding a profile JSON snapshot. Scanning device replaces its profile.
No auth, no backend.

---

## FW11 — Embedded video / audio / liveblog rendering

**Why**: MVP strips them with a placeholder. Honest cut but limits UX
for DW's video-heavy content.

**Shape**:
- Detect HLS / MP4 sources in `vjs-wrapper`, render with a lightweight
  HTML5 video player (no video.js).
- Image galleries: simple swipeable lightbox.
- Liveblog elements: fetch the parent liveblog and render entries
  reverse-chronologically.

Pairs with M3 (detail view + DOMPurify body sanitiser).

---

## FW12 — Daily streak freeze tokens

**Why**: MVP design resets streak on miss. Real engagement loops use
forgiveness mechanics.

**Shape**: Duolingo-style — 1 freeze token per 7-day streak, max 2.
Auto-consumed on miss.

---

## FW13 — User-controlled "vibe" chip (Untagger Tier B)

**Why**: the M2 untagger work uses dimensions passively to learn the
user's preference. A user-facing chip lets the user *choose* their mood.

**Shape**:
- 4-way pill near the top of the feed:
  `Facts | Context | Inspire | Useful`.
- Tap to pin the pool's untagger slot (and optionally raise its
  weight) to one dimension temporarily.
- Untap to go back to the learned mix.
- Pin survives until the user untaps or refreshes.

**Why deferred**: users may not understand the four labels without
explanation. Worth experimenting once the passive dimension-learning
loop (M2 proper) has telemetry to compare against.

---

## FW14 — Time-of-day soft tilt on dimensions (Untagger Tier C)

**Why**: cold-start users have empty `dimension_pref`. A free signal —
local time of day — can softly tilt the random uniform pick.

**Shape**:
- Tilt is **additive** to learned weights, never replaces them. After
  ~5 likes the learned weights dominate the tilt entirely.
- Suggested tilts (tunable):
  - 06:00–11:00 → +20 `fact_driven`
  - 11:00–18:00 → neutral
  - 18:00–23:00 → +15 `emotion_driven`, +10 `context_driven`
  - 23:00–06:00 → +15 `context_driven` (long-reads at night)

**Why deferred**:
- Hypothesis is *our* opinion, not a measured user preference.
- Many users want hard news at night and would feel the app fighting
  them.
- Hackathon judges hit the app once at one time of day → never see the
  mechanic doing anything different.
- The learned `dimension_pref` from M2 is the honest version of this
  feature.

Revisit once we have analytics from the dedicated sitekey (FW1) and can
A/B the tilt against pure learned weights.
