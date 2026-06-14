# my.dw.com — Locked-in decisions (from initial brief)

These are not up for debate in the grilling rounds. Captured so a future agent
doesn't waste cycles re-deciding.

## Product framing
- **Name**: `my.dw.com` (PoC, hackathon)
- **Pitch**: A personal news companion that learns your taste with no signup.
  Reels-style "next article" flow over DW content, cross-language exploration,
  optional fun layers (streak, language-learning level, teacher mode).
- **Scope**: Proof of concept. Not production. Deployed to GitHub Pages.

## UX primitives (from brief)
- **No login**. Device-scoped profile (localStorage).
- **Onboarding**: a few category/interest questions OR pick from trending. No
  account creation.
- **Consumption pattern**: One article at a time, full-screen.
  - Show **summary first**; "Read more" expands to full article.
  - "Next" button advances. No back-to-grid.
  - Never repeat a content_id within a session (and ideally across sessions).
- **Interaction signals**: like, save-for-later.
- **Cross-language exploration**: user with multiple languages can see the same
  story from different DW-language perspectives.
- **Optional "keep it fun"**: daily streak, language-learning level filter,
  teacher mode, random/shuffle button, multi-armed-bandit-style mix.

## Tech stack (locked)
- **Framework**: SolidJS. NOT SolidStart SSG — we only need an SPA shell.
  Single-content view, "next" button rotates content.
- **Package manager**: pnpm.
- **Deploy**: GitHub Pages. Base-path handling via `BASE_PATH` env var
  flowing into Vinxi config + entry-server `<base href>`. Full setup
  inlined in `handoff/deploy-setup.md`.
- **No backend of our own**: we call the public DW PEACH endpoints and the DW
  GraphQL content API directly from the browser. CORS permitting.

## Data layer (locked)
- **Recommendation source**: DW PEACH REST endpoints
  (`/v2/<endpoint>`, returning `{result: {items: [{content_id, ...}]}}`).
  Available endpoints we plan to combine:
  - `trending_tz`, `trending_by_region`, `trending_by_category`
  - `most-viewed`, `most-watched`
  - `similar`, `similar_for_user`, `similar_for_content_by_user`
  - `search` (text → similar content) for onboarding interest matching
  - `collab_filter_duckdb` (needs Peach cookie `_pc_c` user_id)
- **Content fetching**: DW GraphQL with **per-content-id persisted queries
  using GET** (so each content is a distinct, cacheable URL). Pattern mirrors
  `CollaborativeFilter.jsx` + `ListDefaultUnifiedBigImageTextIndependentLoadTemplate.jsx`
  + `WithGraphQLQueryFetch.jsx` in `~/own/dw/webapp`.
  - Path shape: `${langCode}/${appName}/content/peach/${contentId}`
  - Persisted query (sha256, GET) from day one. No POST.
- **Cache strategy**: rely on HTTP cache + per-content-id URL granularity.
  Different users hit the same per-id URL → CDN cache hits.

## Out of scope (PoC)
- Server-side rendering.
- Auth / accounts.
- Push notifications.
- Cross-device sync.
- Comments / sharing UX beyond "open original".
- A/B testing infra.

## Open questions
Tracked in `handoff/01-grill-round-1.md` and subsequent rounds.
