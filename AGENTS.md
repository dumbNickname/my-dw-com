# AGENTS.md — my.dw.com

A personalised, no-login, reels-style reader for Deutsche Welle content.
SolidStart SPA deployed to GitHub Pages. No backend, no auth, profile in
`localStorage`.

This file is the durable orientation for any agent (human or AI) picking
up the codebase fresh. It captures what's built, what's still pending,
and the architectural invariants you must not violate when extending it.

Live URLs:
- **App**: <https://dumbnickname.github.io/my-dw-com/>
- **Cloudflare Worker (GraphQL CORS shim)**: <https://mydw-api.impalatab.workers.dev/>
- **PEACH recommendation API**: <https://api.dedw.peach.ebu.io/v2/...>
- **DW GraphQL** (upstream of the Worker): <https://webapi.dw.com/graphql>

---

## 1. Quick start

```bash
pnpm install
cd solid-site
pnpm run register-hashes   # one-off, populates src/data/query-hashes.json
pnpm dev                   # http://localhost:3000/
pnpm typecheck             # tsc --noEmit
pnpm build                 # outputs .output/public/ (static)
pnpm preview               # serves the build locally
```

CI deploys `solid-site/.output/public/` to GitHub Pages on push to `main`.
The workflow lives at `.github/workflows/deploy.yml`. It also runs
`pnpm run register-hashes` against `webapi.dw.com` so the bundle ships
with up-to-date persisted-query hashes.

Env vars (build-time):
- `BASE_PATH=/my-dw-com` — repo subpath. Hardcoded in CI.
- `VITE_GRAPHQL_BASE_URL=https://mydw-api.impalatab.workers.dev` — the
  Cloudflare Worker URL by default. Override per-deploy via
  `vars.VITE_GRAPHQL_BASE_URL` in the GitHub repo Variables. **Safe to
  commit** — the Worker URL is public (see §3).

---

## 2. Stack

- **SolidStart** with `preset: "static"` and `ssr: false`. Pure SPA, no
  hydration. Vinxi prerenders `/` and `/<BASE_PATH>/` to `index.html`.
- **pnpm 9**, Node 22.
- **CSS modules** for component-scoped styles; tiny global stylesheet
  (`src/styles/global.css`) only for design tokens, resets, and a few
  shared utilities (`.btn`, `.shell`, `.section-*`, `.notice`).
- **No runtime dependencies** beyond SolidJS itself. No state library, no
  UI kit, no HTTP client. Native `fetch` + `localStorage` + Solid signals.
- **No proxy, no backend.** The one piece of server-side code is the
  Cloudflare Worker (§3), and it's a stateless 70-line CORS shim.

---

## 3. The Cloudflare Worker

**Why it exists**: `webapi.dw.com/graphql` has two problems that, combined,
prevent any browser-side cross-origin call:

1. Apollo's CSRF protection rejects GETs without `apollo-require-preflight`
   or `x-apollo-operation-name`.
2. The DW gateway's OPTIONS preflight returns HTTP 400 with no
   `Access-Control-Allow-Methods` / `-Headers`. Browsers reject the
   preflight before any real request goes out.

There's no (method, headers, content-type) combination that satisfies
both Apollo CSRF and the missing CORS allow-list. Production `dw.com`
sidesteps this with a same-origin server proxy. Our SPA can't.

**Solution**: `cloudflare-worker/worker.js` (70 LOC) forwards every
request to `webapi.dw.com/graphql`, adds `apollo-require-preflight`
server-side, and answers OPTIONS preflights with the right headers. Free
tier: 100k req/day. Each card render is ~2 requests with preflight
cached for 24h, so practical ceiling is ~50k card views/day.

**To retire it** (the day DW widens CORS on `webapi.dw.com`): point
`VITE_GRAPHQL_BASE_URL` at `https://webapi.dw.com/graphql` and delete
the Worker. No code change in the SPA.

The Worker URL `mydw-api.impalatab.workers.dev` is committed as the
default fallback in `.github/workflows/deploy.yml` and
`solid-site/src/lib/graphql.ts`. **The URL is not a secret** — the
upstream is public, anyone calling the Worker just consumes free-tier
quota. If abuse becomes real, add an `Origin` allow-list in `worker.js`
(~5 lines).

---

## 4. Architecture invariants

These are the rules that have to hold for the app to work at all. If you
catch yourself thinking about violating one, stop and reconsider.

### 4.1 SPA-only, no SSR

Every route depends on either `localStorage` or runtime fetches. SSR
would render an empty shell and risk hydration mismatches. `app.config.ts`
declares `ssr: false`.

### 4.2 GitHub Pages SPA fallback

GH Pages doesn't natively support SPA routing. `scripts/copy-404.mjs`
runs after `pnpm build` and copies `index.html` → `404.html` so any
deep-link refresh (`/feed`, `/my-dw-com/feed`) re-bootstraps the SPA
shell. The router (`@solidjs/router`) is configured with
`base={BASE_PATH}` and strips the prefix from the URL.

### 4.3 GraphQL: persisted queries with GET-first, POST-register fallback

The SPA uses Apollo's APQ pattern:

1. Always try `GET /graphql?variables=...&extensions={persistedQuery:{sha256Hash}}`.
2. If the response is `{errors:[{message:"PersistedQueryNotFound"}]}`,
   POST the full query body once. Apollo registers it under the same
   hash. The POST response also contains the data, so we use it directly.
3. Subsequent GETs from the same edge node hit the registration.

`scripts/register-graphql-hashes.mjs` runs at build time and pre-registers
both queries, baking the hashes into `src/data/query-hashes.json`. This
way the first user request can already use the GET path.

**Currently registered queries** (see `scripts/register-graphql-hashes.mjs`):

```graphql
query MyDwCard($id: Int!, $lang: Language!) {
  content(id: $id, lang: $lang) {
    ... on ModelAspect { id modelType language }
    ... on NamedAspect { title }
    ... on TeaserAspect { roadTeaserKicker }
    ... on TextualAspect { shortTeaser teaser }
    ... on DeliveryAspect { contentDate }
    ... on AssociationsAspect {
      categories { name originId }
      regions { name originId }
      mainContentImage { staticUrl }
    }
    ... on UrlAspect { namedUrl }
    ... on PlaybackResourceAspect { formattedDurationInMinutes duration }
  }
}

query MyDwBody($id: Int!, $lang: Language!) {
  content(id: $id, lang: $lang) {
    ... on ModelAspect { id }
    ... on TextualAspect { text }
  }
}
```

- `MyDwCard` runs for every card in the pool — kept lean.
- `MyDwBody` runs only when the user taps Expand. Lazy.

**If you change either query string, you MUST re-run `pnpm run register-hashes`**
(or let CI do it on the next push). The hash is a sha256 of the exact
query text; one extra whitespace and the bundle hash diverges from
upstream's registration and you'll see `PersistedQueryNotFound` on every
GET until the runtime POST-register fallback kicks in.

### 4.4 Image format ladder

`mainContentImage.staticUrl` from GraphQL contains a literal
`${formatId}` placeholder you must substitute before rendering:

```
https://static.dw.com/image/77528576_${formatId}.jpg
```

Format groups (lifted from `~/own/dw/webapp/src/utils/imgUtils.js`):

| Group  | Aspect    | Use                          |
|--------|-----------|------------------------------|
| `60X`  | 16:9      | **default** — feed card hero |
| `80X`  | 1:1       | thumbs (library sheet, etc.) |
| `90X`  | mixed     | inline body figures          |
| `100X` | 16:7      | wide hero (rare)             |

Use `resolveImage(staticUrl, group, targetCssPx)` from `~/lib/image`.
Picks the smallest ladder entry whose width ≥ targetCssPx × DPR. Pass
the **CSS** rendered width; the helper handles DPR (capped at 2).

**Snapshot policy**: when storing a content snapshot for offline use
(saves, likes), resolve the URL at write-time so the persistent storage
has no placeholder. `LibrarySheet` also has a render-time fallback for
backward compatibility with old entries.

### 4.5 PEACH lang param

PEACH accepts the GraphQL `Language` enum value directly (`ENGLISH`,
`GERMAN`, `SPANISH`, ...) — NOT ISO codes. Don't lowercase. Don't
translate. `lang=en` returns HTTP 200 but empty results; `lang=ENGLISH`
returns content. The full enum list is in
`solid-site/src/data/languages.json`.

### 4.6 Profile is the only state

Everything user-related lives in `localStorage["mydw_profile_v1"]`. No
cookies, no analytics, no server-side state. Schema is defined and
documented in `solid-site/src/lib/profile.ts`. Bump `KEY` (e.g. to
`mydw_profile_v2`) if you make a breaking schema change so existing
users start fresh rather than crashing on `load()`.

In-page writes broadcast a `mydw:profile-change` `CustomEvent` so the
app footer's library badge updates without prop-drilling. If you add
another consumer that needs reactive profile state, listen for the
same event.

### 4.7 Body HTML is plain text only (M3 will fix)

`MyDwBody.text` is full DW article HTML with `<video>`, `<figure>`,
embed `<div>`s, internal/external links, and so on. The current
implementation in `lib/htmlText.ts` strips ALL tags and entity-decodes
to plain paragraphs. Zero XSS surface. M3 will replace this with a
DOMPurify-based sanitiser that preserves structure and rewrites embed
placeholders. Until then: do not `innerHTML` anything you didn't strip.

---

## 5. Code map

```
solid-site/
├── app.config.ts                   SolidStart config (ssr:false, baseURL)
├── scripts/
│   ├── register-graphql-hashes.mjs APQ pre-registration
│   └── copy-404.mjs                GH Pages SPA fallback
├── public/                         static assets
└── src/
    ├── app.tsx                     Router root + Shell (header on /,
    │                               footer + LibrarySheet everywhere)
    ├── app.module.css              shell + footer styles
    ├── entry-client.tsx            client bootstrap (SolidStart default)
    ├── entry-server.tsx            HTML doc shell + theme init script
    ├── env.d.ts                    Vite env types
    ├── styles/global.css           tokens, resets, shared utilities only
    ├── data/
    │   ├── categories.json         20 topic chips
    │   ├── regions.json            6 region groups (EUROPE, ASIA, AFRICA, ME, NORTHAMERICA)
    │   ├── languages.json          31 DW languages (enum + native names)
    │   └── query-hashes.json       generated at build time
    ├── lib/
    │   ├── peach.ts                PEACH client (typed wrappers)
    │   ├── graphql.ts              APQ client + fetchCard + fetchBody
    │   ├── image.ts                resolveImage + format ladder
    │   ├── lang.ts                 LANGUAGES, browser autodetect
    │   ├── htmlText.ts             plain-text body extractor (M3 target)
    │   ├── pool.ts                 cold-start candidate pool
    │   ├── profile.ts              localStorage profile + toggles
    │   └── libraryContext.ts       Solid context: openLibrary()
    ├── components/
    │   ├── Card.tsx + .module.css  feed card + bottom action bar
    │   ├── CarouselCard.tsx + …    onboarding carousel item
    │   ├── LibrarySheet.tsx + …    Saved/Liked bottom-sheet with tabs
    │   └── Skeleton.tsx + …        loading placeholders
    └── routes/
        ├── index.tsx               / — onboarding
        ├── index.module.css        chips + section spacing
        ├── feed.tsx                /feed — the reels loop
        └── [...404].tsx            catch-all → redirect to /
```

---

## 6. What's shipped (June 2026)

- **M0** repo + GH Pages deploy with `BASE_PATH` rewriting.
- **M1** onboarding (languages → topics → regions → trending carousel)
  + single-card feed with prefetch-next.
- **M2 slice**: Like + Save with offline snapshots, app footer with
  Library button + count badge, LibrarySheet with Saved / Liked tabs.
  Liked IDs feed back into `peach.similar` to refine the pool.
- **Lang autodetect**: first-visit picks `navigator.languages[0]` →
  closest DW enum, falls back to `ENGLISH`.
- **Worker**: live and verified end-to-end.
- **Expand**: tap Read on a card → lazy-fetches `MyDwBody`, renders as
  plain paragraphs.
- **Multi-language pool & carousel (FW4)**: pool candidates carry
  `{id, lang}` and the feed fetches each in its own language. Both
  carousel and pool fan out across `profile.langs.slice(0, 3)` and
  interleave results — a user with EN+DE+ES sees all three mixed.
- **Recent-views re-mine (FW4b)**: every card render pushes to a FIFO
  `recent_view_ids[20]` window. Every 5 taps the next refill seeds
  `peach.similar` on a random sample of recent views — the pool adapts
  mid-session even without explicit likes. Refill threshold bumped to
  6 so we top up well before the queue can drain. 60s in-memory cache
  in `lib/peach.ts` collapses identical calls across back-to-back
  refills so quota stays under control.

## 7. What's pending

In rough priority order. Most are M2/M3 from the original plan:

1. **Bandit pool with source weighting** — currently `lib/pool.ts` does
   parallel-fetch + shuffle. PRD M2 calls for explicit per-source weights
   that update based on user signals.
2. **`dimension_pref` accumulation via `/v2/untagger_detail`** — on every
   like, fire-and-forget that endpoint, accumulate score per dimension
   into the profile. Then use it as a sampling weight for an "untagger
   slot" in the pool.
3. **Discovery slot every 7th tap** — pull from `most-viewed` or a
   randomised category, badge "Discover".
4. **Streak counter** — +1 per calendar day after ≥3 cards viewed. Tiny
   flame badge somewhere.
5. **`/article/:contentId` detail view** with DOMPurify body sanitiser
   (see §4.7).
6. **`/saved` proper route** to replace the LibrarySheet stand-in.
7. **Theme toggle UI** (palette already supports dark; flicker-prevention
   script in `entry-server.tsx` reads `localStorage.mydw_theme`).
8. **README screenshots** + reset-profile button in a settings panel.

Deeper-future items live in `handoff/future-work.md`.

---

## 8. Outstanding risks

The originally documented risks R1–R6 have all been resolved in code.
Two remain:

- **R7 — `_pc_c` cookie unavailable on `*.github.io`**: PEACH's
  collab-filter endpoints (`similar_for_user`, `collab_filter_duckdb`,
  `user_history`) need a PEACH `user_id` from a cookie set on `dw.com`
  domains. We can't get it. MVP works around by relying on
  `trending_*` + `similar` (seeded by likes / saves / onboarding).
  Long-term: a dedicated `my.dw.com` PEACH sitekey (see future-work
  FW1). Not a hackathon blocker.
- **R8 — webapi.dw.com cross-origin block**: the reason the Worker
  exists. Permanent fix is a single DW gateway config change (return
  proper `Access-Control-Allow-Methods` / `-Headers` on OPTIONS for
  `/graphql`). Until then, Worker stays.

Full discussion in `handoff/architecture-risks.md`.

---

## 9. Conventions

- **CSS modules** named `*.module.css` next to the component. Class
  names stay kebab-case; reference via `styles["chip-row"]`. Only
  truly-shared rules live in `src/styles/global.css`.
- **No emojis in code** unless explicitly requested.
- **No comments** unless explicitly requested. Code should read clearly.
  (This rule is from the opencode session prompt; if you're a human,
  use your judgement.)
- **Profile mutations** go through the `toggleLike` / `toggleSave` /
  `markSeen` helpers in `lib/profile.ts`. Don't mutate the localStorage
  blob directly.
- **Persisted-query changes** require re-running `pnpm run register-hashes`
  AND committing the regenerated `src/data/query-hashes.json`. CI does
  this on every build, but local dev needs the file to be present.
- **Cloudflare Worker code** lives in `cloudflare-worker/`. The dashboard
  deploy and `wrangler deploy` paths both work; see
  `cloudflare-worker/README.md`.

---

## 10. External references

The codebase intentionally has zero references to DW-internal repos at
runtime, but these were the sources of truth during initial design and
remain useful for deeper questions:

- `~/own/dw/webapp/` — production DW frontend. Useful for:
  - `src/utils/css/index.js` — full DW colour palette (already in
    `styles/global.css`).
  - `src/utils/imgUtils.js` — image format ladder (already in `lib/image.ts`).
  - `src/utils/langMapper.js` + `src/components/navigation/LanguageSelector/languages.json`
    — language enum / code / native-name map (already in `data/languages.json`).
  - `src/server/react-server/server-apollo-link.js` — confirms Apollo
    persisted-query link uses GET for hashed queries
    (`useGETForHashedQueries: true`). Same pattern as our `lib/graphql.ts`.
- `~/workshop/` — PEACH `dw_libs` Python package.
  - `peach.conf/endpoints.yaml` — canonical endpoint registry.
  - `dw_libs/metadata/task.py` — reference implementation of the
    persisted-query register-then-GET dance, ported to TS in
    `scripts/register-graphql-hashes.mjs`.
