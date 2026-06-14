# Round 4 — Untagger as a pool source

## Context
The Smartocto Untagger classifies every DW article on 4 user-need
dimensions (`fact_driven`, `context_driven`, `emotion_driven`,
`action_driven`), each with a score 0–100 + sub-categories + LLM
explanation. Endpoint verified live; sample responses show reasonable
score distributions and per-content explanations.

Original PM idea: serve more fact-driven content in the morning and
emotion-driven in the evening (time-of-day default).

## Decision
**Tier A** for MVP: untagger becomes a pool source (5% weight). The
user's *demonstrated* dimension preference (from likes) steers the
sampling. **No clock involved.**

Tiers B (user-controlled vibe chip) and C (time-of-day tilt) documented
as FW15 / FW16 for after MVP.

## Why not time-of-day in MVP
1. The "fact in morning, emotion at night" hypothesis is *our* opinion,
   not a measured user preference. Lots of users want hard news at
   night and would feel the app fighting them.
2. We already have a stronger, honest signal: the user's own likes on
   cards with known dimension scores. Cheaper, demoable in 30 seconds,
   not paternalistic.
3. Hackathon judges hit the app once at one time of day — they'll
   never see the mechanic actually doing anything different.

## Why 5% and not more
- Untagger corpus is sparser than `most-viewed` / `trending_tz` —
  especially for `emotion_driven` and `action_driven` dimensions.
- The dominant learning loop in MVP is `similar` seeded by likes (35%).
  Untagger is a complementary axis (intent), not a replacement.
- If telemetry from a real user base (post-FW1) shows higher engagement
  on untagger-sourced cards, crank to 15–20%.

## Pool weights (final MVP)

| Source                | Weight | Notes                          |
|-----------------------|--------|--------------------------------|
| `similar`             | 35%    | seeded by last_seed_id / likes |
| `trending_tz`         | 25%    | freshness                      |
| `trending_by_category`| 15%    | onboarding chips               |
| `most-viewed`         | 10%    | popularity baseline            |
| `untagger`            |  5%    | editorial intent steering      |
| Discovery slot        | 10%    | random, ignores profile        |

`trending_by_category` lost 5pp to make room for `untagger`. Reason: the
onboarding chips already shape the seed pool (Q3.2 pragmatic blend) and
the `similar` source amplifies category alignment via content embeddings.

## Mechanics

### On like
1. Add card's `content_id` to `profile.liked_ids`.
2. Fire-and-forget `GET /v2/untagger_detail?content_id=<id>`.
3. On response, for each of the 4 dimensions:
   `profile.dimension_pref[dim] += dimension_score`.
4. Persist profile to localStorage.

### On pool build (untagger slot)
1. Compute weights = `{dim: dimension_pref[dim] + 5}` for all 4 dims.
2. Weighted-random pick one dimension.
3. `GET /v2/untagger?lang=<lang>&dimension=<dim>&min_score=40&amount=10`.
4. Drop `explanation` field on read.
5. Merge `content_id`s into the bandit pool, dedup against `seen_ids`.

### Cold start (empty `dimension_pref`)
All weights = 5 → uniform random across dimensions. After 2–3 likes
the preference becomes visible in the pool composition. That IS the
demo moment.

## Risk: `min_score=40` may return too few items
Some dimensions (especially `action_driven`, `emotion_driven`) have
fewer high-scoring articles. Mitigation:
- If `items` < 5, retry with `min_score=20`.
- If still empty, skip the untagger slot for this tap and re-roll the
  bandit (don't show stale content from yesterday's untagger sweep).

## Demo moment
After 2 likes on inspiring stories, the user starts seeing more of them
in the feed *without* having ticked a category, picked a region, or
opened any settings. Combined with the `similar`-walk, this is the
"learned in 30 seconds without a login" demo for Goal 2 in the PRD.
