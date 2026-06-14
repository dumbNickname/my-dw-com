# my.dw.com (PoC)

A personalised, no-login, reels-style reader for DW content. SPA on GitHub
Pages. SolidStart in `solid-site/`. No backend, no auth, profile in
`localStorage`.

Deployed to: <https://dumbnickname.github.io/my-dw-com/>

## Local dev

```bash
pnpm install
cd solid-site
pnpm run register-hashes   # one-off: registers GraphQL persisted queries with webapi.dw.com
pnpm dev
```

Open <http://localhost:3000/>.

## Build

```bash
cd solid-site
pnpm build                # outputs .output/public/ (static)
pnpm preview              # serves the build locally
```

## Stack

- SolidStart with `preset: "static"` (app-shell SPA, no SSR).
- DW PEACH recommendation endpoints (`api.dedw.peach.ebu.io/v2/...`) — `most-viewed`, `trending_tz`, `trending_by_category`, `similar`.
- DW GraphQL content (`webapi.dw.com/graphql`) with persisted queries pre-registered at build.
- localStorage profile, no telemetry, no cookies.

## Scope (M0 + M1)

- Onboarding: 12 category chips + 10 region chips + trending carousel.
- Feed: full-screen single card, "Next" button, no-repeat per device.
- Cold-start pool: trending-by-category + similar-from-onboarding-taps, fallback trending_tz.

Likes / saves / streak / detail-view / Smartocto untagger ship in later
iterations (see `handoff/PRD.md`).
