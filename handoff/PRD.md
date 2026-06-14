# my.dw.com — PRD (PoC, hackathon scope)

## 1. Summary
A personal, no-login, reels-style reading app for DW content. The user picks a
few interests, then taps through full-screen cards. Likes, saves, and skips
shape what comes next, all stored locally on the device. PoC deployed to
GitHub Pages.

## 2. Goals (demo moments)
1. **TikTok-format for DW content** feels right.
2. **It learns in 30 seconds without a login.**
3. **Multi-language mix** surfaces stories the user's main language doesn't
   cover (v1.1).

## 3. Non-goals (MVP)
- Authentication.
- Server-side rendering.
- Push notifications, sharing, comments.
- Cross-device sync.
- Embedded video / audio / live-blog rendering. Linked out to `dw.com` with
  a clear "Open original" affordance + canonical link.
- Teacher / language-learner modes (documented in future-work).
- Collaborative-filtering recommendations (no `_pc_c` cookie outside `dw.com`).

## 4. Users
- **Primary**: multilingual, curious news consumers who want serendipity.
- **Co-primary**: Gen-Z users used to algorithmic feeds.

## 5. Milestones

### M0 — Repo + deploy skeleton (½ day)
- SolidStart `preset: "static"`, base-path-aware GitHub Pages workflow.
- `entry-client.tsx` is the SolidStart default — **no** full-reload shim.
- 404 → SPA fallback (`copy-404.mjs`).
- Repo layout: `solid-site/` containing the app (see
  `handoff/deploy-setup.md` for the directory tree).
- Hello-world route renders. Live at GitHub Pages preview URL.

**Exit**: `pnpm build && pnpm preview` works. GH Pages deploy succeeds.

### M1 — Onboarding + single-card feed (1 day)
- `/` route: onboarding screen.
  - Top: 12 category chips + 10 region chips, from `categories.json` /
    `regions.json` (committed, see Round 3 doc).
  - Bottom: horizontal carousel of 10 cards from
    `most-viewed?lang=ENGLISH&amount=10`. Each card shows image + title +
    kicker. Tap toggles selection.
  - Mandatory: ≥1 chip OR ≥1 card before "Start".
  - Onboarding selections written to `localStorage.mydw_profile_v1`.
- `/feed` route: single full-screen card.
  - Pool-source: pragmatic seed (Q3.2) — 50% `trending_by_category` on picked
    chips + 50% `similar` seeded by tapped cards. Fallback `trending_tz`.
  - Card layout per Q2.4 (image, kicker, title, summary, language badge,
    relative date, duration for video/audio).
  - Bottom action bar: Like, Save, Read more, Next.
  - Pre-fetch next card while current is on screen.

**Exit**: Onboard → see 3 personalized cards → tap Next.

### M2 — Signals + bandit pool + streak (1 day)
- Like / Save buttons persist to `mydw_profile_v1`.
- On like: fire-and-forget `/v2/untagger_detail?content_id=...` and
  accumulate dimension scores into `profile.dimension_pref`.
- Bandit pool builder (Round 4 weights). Per-tap pool rebuild, weighted
  random pick. Seen-id dedup with FIFO eviction (cap 500).
- Untagger slot: weighted-random dimension pick from `dimension_pref + 5`
  floor, then `/v2/untagger?dimension=<dim>&min_score=40&amount=10`.
- Skip = Next without expand/like → soft negative, reduces similar-walk
  influence next round.
- Discovery slot every 7th tap, badged "Discover".
- Streak: +1 per calendar day after ≥3 cards viewed (Q2.6). Flame badge
  in header.
- Header: streak badge, saved-count badge.

**Exit**: After 5 taps + 2 likes on inspiring stories, the feed visibly
shifts toward `emotion_driven` / similar topics. Streak visible.

### M3 — Detail view + sanitiser (1 day)
- `/article/:contentId?lang=ENGLISH` route.
- Renders sanitised `text` (see `api-contract.md` for allow-list).
- Unsupported embeds replaced with "🎞 Embedded content — view on dw.com →"
  linking to `https://www.dw.com{namedUrl}`.
- `<link rel="canonical">` + visible "Open original on dw.com ↗" buttons.
- Back-button returns to feed at the same card.
- `/saved` route: vertical list of saved cards with Remove per row.

**Exit**: Tap Read more on a card with mixed content → see clean article
with embed placeholders. Save → article appears in `/saved`.

### M4 — Polish (½ day)
- Light/dark mode toggle, palette from `webapp/src/utils/css/index.js`.
- Loading skeletons everywhere (Q3.7 indicators).
- "Reset profile" in a small settings panel.
- README + screenshots.

**Exit**: Demo-ready.

## 6. Out-of-MVP roadmap
See `handoff/future-work.md`. Short list:
- Multi-language feed mix.
- Browser-language detection + lang switcher modal.
- Own PEACH sitekey + custom event taxonomy.
- CF-powered recommendations (`similar_for_user`, `collab_filter_duckdb`).
- Custom PEACH endpoint for saved-articles-as-signal.
- Teacher / language-learner modes.
- "Why am I seeing this?" attribution chip per card.
- Dynamic chip taxonomy.

## 7. Success criteria (PoC)
Honest, not metric-driven (no analytics in MVP):
- Demo: a stranger can use it without instructions.
- Demo: 10 taps shows visibly different content for two users with different
  onboarding picks.
- Tech: no proxy, no backend. Pure SPA on GitHub Pages.
- Tech: per-content GraphQL calls are GET-able and identical across users
  (CDN-cache friendly). Persisted query hashes in the bundle.

## 8. Open risks (see `handoff/architecture-risks.md`)
1. Persisted-query registration first-call requires POST (R2). Mitigation:
   register both queries during build, ship hashes.
2. CORS sanity holds — verified for both `api.dedw.peach.ebu.io` and
   `webapi.dw.com` (R6).
3. `_pc_c` cookie unavailable on `*.github.io` → CF endpoints unusable in
   MVP (R7). Mitigation: bandit pool drops CF, documented future work.
4. Body HTML rich-embed scope cut may feel jarring (R4). Mitigation: clear
   placeholder + canonical link + "Open original" button.
