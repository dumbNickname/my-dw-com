# Round 3 — resolved

## Q3.1 — Bandit pool weights (MVP)
Confirmed minus CF (R7 — no `_pc_c` cookie on `*.github.io`), plus the
Smartocto untagger as a "user-need dimension" source (added in Round 4):

| Source                                                      | Weight | Notes                                       |
|-------------------------------------------------------------|--------|---------------------------------------------|
| `similar` seeded by `last_seed_id` (or any `liked_ids`)     | 35%    | Local "for you" via content-content sim     |
| `trending_tz` (lang + browser TZ)                           | 25%    | Freshness                                   |
| `trending_by_category` (random user-picked category)        | 15%    | Honors onboarding chips                     |
| `most-viewed`                                               | 10%    | Popularity baseline                         |
| `untagger` (dimension weighted by user's dim-pref profile)  |  5%    | Editorial-intent steering                   |
| Discovery slot (random EN trending, ignores profile)        | 10%    | Every ~7th tap, badged "Discover"           |

Pool is rebuilt per Next-tap. Each source is fetched in parallel, deduped
against `seen_ids`, then we pick one weighted-randomly across the merged pool
(not source). Source attribution is kept on each candidate so we can later
show "why am I seeing this?" (deferred per Q2.4).

### Untagger mechanics (Round 4 — Tier A)
The Smartocto untagger classifies each article on 4 dimensions
(`fact_driven`, `context_driven`, `emotion_driven`, `action_driven`),
each with a score 0–100 plus sub-categories and an LLM `explanation`.

- **When a user likes a card**, fire-and-forget call
  `/v2/untagger_detail?content_id=<id>` and accumulate the dimension
  scores into `profile.dimension_pref` (additive, no decay in MVP).
- **When the pool builder picks the untagger slot**, it weighted-randomly
  picks one of the 4 dimensions from `dimension_pref`. Empty profile →
  uniform random. Always add a small floor (e.g. +5 per dimension) so
  unliked dimensions still surface occasionally.
- Picked dimension → `/v2/untagger?lang=ENGLISH&dimension=<dim>&min_score=40&amount=10`.
- Drop the `explanation` field from the response on read — it's ~500
  chars of LLM reasoning we don't need in the bundle.

**Why this is in MVP**: it's the second visible learning loop. After 2–3
likes on "inspiring" stories the feed starts surfacing more of them,
and we can demo that in 30 seconds. Honest, no time-of-day hacks.

**Explicitly deferred to future-work** (see `future-work.md`):
- FW15 — user-controlled "vibe" chip (Facts/Context/Inspire/Useful).
- FW16 — time-of-day soft tilt on dimension weights for cold start.

### Future work — Collaborative Filtering (when available)
Once `my.dw.com` has its **own PEACH sitekey**:
1. SPA mints a stable per-device id (UUID v4, persisted localStorage).
2. SPA sends custom events to PEACH: `card_view`, `summary_expand`,
   `read_more_click`, `next_skip`, `like`, `save`, `language_jump`.
3. CF training runs over the new sitekey's events.
4. SPA calls `similar_for_user?user_id=<our_device_id>` and
   `collab_filter_duckdb?user_id=<our_device_id>`.
5. Pool weights shift: introduce CF at ~25%, drop `most-viewed` to 5%.

This unlocks "Save for later" as a CF signal too — a custom PEACH endpoint
could rank "things to read because you save articles like this".

## Q3.2 — Pool[0] (zero likes)
Pragmatic blend:
- 50% `trending_by_category` filtered to onboarding-picked chips (both
  categories and regions — the endpoint takes `origin_id`).
- 50% `similar` seeded by *any* article tapped during onboarding.
- Falls back to `trending_tz` if both come back empty.
- After ≥2 likes, switch to the full Q3.1 pool.

## Q3.3 — Saved articles
- MVP: dedicated `/saved` route. Vertical list of saved cards (image + title +
  kicker + date). Tap → detail view. Has a "Remove" action per row.
- Surfaced from header as a bookmark icon with a small count badge.

### Future work — Saved-as-CF-signal
With own sitekey, "save" event becomes a strong positive signal. Could power a
custom PEACH endpoint `/recommended_from_saves?user_id=...` returning content
similar to the user's save corpus. Surfaced inline as a "Pick up where you
left off" card every Nth tap (Q3.3 option d).

## Q3.4 — Onboarding chip taxonomy
**Approach: static for MVP, generated from real PEACH redis data.**

Categories were dumped from `dedw_v1_trending_by_category` (read-only). They
ship in `src/data/categories.json` with their **DW originIds** so they're
direct keys for `trending_by_category`. The static MVP list (top 20 by current
content volume in EN/DE/etc, excluding non-Latin script entries):

```json
[
  {"id": "19990022", "name": "Politics"},
  {"id": "19990006", "name": "Society"},
  {"id": "19990023", "name": "Conflicts"},
  {"id": "19990032", "name": "Business"},
  {"id": "19990010", "name": "Culture"},
  {"id": "19991201", "name": "Offbeat"},
  {"id": "19990033", "name": "Science"},
  {"id": "19990021", "name": "Nature and Environment"},
  {"id": "19990029", "name": "Sports"},
  {"id": "19990007", "name": "Health"},
  {"id": "19990027", "name": "Human Rights"},
  {"id": "19990019", "name": "Lifestyle"},
  {"id": "19990031", "name": "Technology"},
  {"id": "19991200", "name": "Migration"},
  {"id": "19990028", "name": "Travel"},
  {"id": "19990004", "name": "Digital World"},
  {"id": "19990016", "name": "Music"},
  {"id": "19991500", "name": "Climate"},
  {"id": "19990013", "name": "Film"},
  {"id": "19990001", "name": "Cars and Transportation"}
]
```

Region chips (top 10 by content volume) for the regional bucket section:

```json
[
  {"id": "region:europe:DE", "name": "Germany"},
  {"id": "region:europe", "name": "Europe"},
  {"id": "region:global", "name": "Global"},
  {"id": "region:northamerica:US", "name": "United States"},
  {"id": "region:europe:UA", "name": "Ukraine"},
  {"id": "region:europe:RU", "name": "Russia"},
  {"id": "region:me:IR", "name": "Iran"},
  {"id": "region:me", "name": "Middle East"},
  {"id": "region:asia:CN", "name": "China"},
  {"id": "region:africa", "name": "Africa"}
]
```

### Future work — Dynamic chip generation
At app load, fetch top 30 trending articles, compute frequency over their
`categories[].originId` and `regions[].originId`, render the most-frequent
ones with names taken from the same response. This guarantees chips match
*current* DW newsroom focus and surface emergent topics. Out of MVP because
it costs an extra round-trip on first paint and requires a small ranker.

## Q3.5 — Teacher / language-learner modes — **OUT OF MVP**
Documented as future work in `handoff/future-work.md`. Honest reason:
neither has a real signal in the current PEACH endpoint set. Faking them in
MVP would undermine the demo.

## Q3.6 — Visual design
**DW-aligned**, sourced from `~/own/dw/webapp/src/utils/css/index.js`:

```
DW_DARK_BLUE       #002186   primary, headers, active state
DW_LIGHT_BLUE      #05B2FC   accents, links, "Discover" badge
DW_YELLOW          #FAE000   used sparingly — like-button active, streak
BLUE_GREY_01..05   #F0F6FA → #445D7B   surface tints (light mode)
DARK_BLUE_GREY_01  #081336   dark mode background base
DARK_BLUE_GREY_02  #000821   dark mode deepest
WARM_GREY_01..03   neutral text/borders
ACCENT_GREEN       #63DE9D   save-active, success
ACCENT_RED         #EF6C6C   skip indicator
BREAKING_RED       #BE232D   breaking-news kicker
```

Both light and dark modes ship in MVP, toggle in header. Default: respects
`prefers-color-scheme`. Uses CSS custom properties on `:root` swapped by a
`[data-theme="dark"]` selector. Full token table + theming gotchas inlined
in `handoff/deploy-setup.md` §8.

## Q3.7 — Repo structure
**SolidStart with `preset: "static"` (option a).** App-shell only — no
prerender list (`prerender.routes` left as `["/"]` so the GH Pages 404 →
SPA fallback hack still works).

### Things to NOT do (anti-patterns to avoid)
- **No full-reload click handler in `entry-client.tsx`.** Some SSG
  templates force `window.location.href = href` on every internal link
  so each route is a freshly rendered HTML document. We're an SPA — let
  the SolidJS router handle navigation.
- **No `popstate` → `location.reload()`.** Same reason.
- **DO keep a 404 → SPA fallback.** GitHub Pages serves `404.html` for
  unknown paths. We need it to load the SPA shell so direct hits to
  `/article/:id` and `/saved` route client-side. See
  `handoff/deploy-setup.md` §5.
- CSS inlining is optional; SolidStart's default CSS injection is fine
  for an app-shell.

### Loading indicators (added per PM request)
- Onboarding screen: spinner while trending carousel loads.
- Feed: pre-fetch the *next* card's GraphQL data while the user reads the
  current one. Skeleton card if the next isn't ready when Next is tapped.
- Detail view: skeleton title + image placeholder while body loads.
- Use a single `<LoadingIndicator size="sm|md|lg" />` component. CSS-only,
  no JS animation libraries.
