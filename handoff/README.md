# my.dw.com — handoff index

A SolidJS SPA proof-of-concept for a personalised, no-login, reels-style DW
news reader. Deployed to GitHub Pages.

## Read order for the next agent
1. **`PRD.md`** — what we're building, milestones, scope cuts.
2. **`api-contract.md`** — exact endpoints, GraphQL fragments, HTML
   sanitiser allow-list, image format ladder, profile schema. Enough to
   start coding without re-discovery.
3. **`deploy-setup.md`** — repo layout, `app.config.ts`, GitHub Actions
   workflow, 404 SPA fallback, GraphQL persisted-query pre-registration,
   theme tokens. Inlined and self-contained.
4. **`architecture-risks.md`** — risks discovered during grilling. Ignore
   at your peril.
5. **`future-work.md`** — everything intentionally deferred. Don't build
   these for MVP; reference when judging "should this go in?".

## Decision audit trail
- `00-locked-in.md` — given by the PM up front.
- `01-grill-round-1.md` — scope, persona, language, "next" semantics, deploy.
- `02-grill-round-2.md` — onboarding, signal model, language mix, card
  contents, read-more behaviour, streak.
- `03-grill-round-3.md` — bandit pool weights, cold-start, saved UX, chip
  taxonomy, teacher/learner cut, design palette, repo structure.
- `04-grill-round-4.md` — Smartocto Untagger as a pool source (Tier A);
  time-of-day variants deferred to FW15/FW16.

## Source repos referenced
- `~/workshop/` — PEACH `dw_libs` Python package. `peach.conf/endpoints.yaml`
  is the canonical endpoint registry. `dw_libs/metadata/task.py` is the
  reference implementation of the GraphQL persisted-query GET pattern
  we're porting to TS in `register-graphql-hashes.mjs`.
- `~/own/dw/webapp/` — production DW frontend. Useful as a reference for:
  - `src/utils/css/index.js` — colour palette + breakpoints (already
    distilled into `deploy-setup.md` §8).
  - `src/utils/imgUtils.js` — full image format ladder (already
    distilled into `api-contract.md` §3).
  - `src/components/ContentBlocks/CollabFilter/CollaborativeFilter.jsx`
    — per-content fetching pattern.
  - `src/components/commons/WithGraphQLQueryFetch.jsx` and
    `src/components/hooks/useGqlFetch.js` — the cache-friendly per-id
    fetch pattern.
  - `src/server/react-server/server-apollo-link.js` — confirms Apollo
    persisted-query link uses GET (`useGETForHashedQueries: true`).

## What's verified live (June 2026)
Everything in `api-contract.md` was probed against production endpoints
during the grilling session. Concrete:
- `api.dedw.peach.ebu.io/v2/most-viewed`, `/trending_tz`, `/similar` —
  working, returning real content_ids. CORS `*` confirmed.
- `webapi.dw.com/graphql` — returns full card data for a given content_id
  with `Access-Control-Allow-Origin: *`. Schema requires `id: Int!`.
- Redis dump (read-only) confirmed 48 categories and 176 regions present
  in production data; static chip lists derived from real volume.
- Image format ladder taken from production code: `60X` (landscape) is
  the default for body content, `80X` (square) for thumbs, `90X` for
  inline body figures.

## Stack at a glance
- SolidStart with `preset: "static"` (app-shell only).
- pnpm, Node 22.
- GitHub Pages deploy via `.github/workflows/deploy.yml` with `BASE_PATH`
  env var. Full workflow YAML in `deploy-setup.md` §3.
- DW colour palette tokenised on `:root`, full table in
  `deploy-setup.md` §8.
- DOMPurify for the body sanitiser.
- No backend. No proxy. No auth. localStorage profile.

## Where to start coding (M0 in PRD)
1. Scaffold SolidStart at `solid-site/` using the layout in
   `deploy-setup.md` §1.
2. Drop the GitHub Actions workflow from `deploy-setup.md` §3 into
   `.github/workflows/deploy.yml`. Substitute `OWNER` placeholder.
3. Add `app.config.ts` from §2, the 404 copy script from §5, and a
   stub `entry-client.tsx` per §4 (plain SolidStart default — no
   full-reload shim).
4. Add a hello-world `routes/index.tsx`. Push, confirm GH Pages deploy
   succeeds and the page loads under the project's GH Pages URL.
5. Run `pnpm run register-hashes` once locally to verify the script
   works against `webapi.dw.com` and produces `src/data/query-hashes.json`.

Then M1 in PRD.md.
