# Deploy & repo setup — inlined

Everything the next agent needs to scaffold the repo and ship to GitHub
Pages without going to external references. Verified patterns, copy-paste
ready.

## 1. Repo layout

```
my-dw/                          # repo root (this folder)
├── handoff/                    # PRD, contracts, decisions (this folder)
├── pnpm-workspace.yaml         # optional, single package
├── .github/
│   └── workflows/
│       └── deploy.yml          # GH Pages deploy (see §3)
└── solid-site/                 # the SPA
    ├── package.json
    ├── tsconfig.json
    ├── app.config.ts           # SolidStart config (see §2)
    ├── scripts/
    │   ├── copy-404.mjs        # GH Pages SPA fallback (see §5)
    │   └── register-graphql-hashes.mjs   # build-time APQ registration (see §6)
    ├── public/                 # static assets, favicon, og image
    └── src/
        ├── app.tsx             # Root component + Router + MetaProvider
        ├── entry-client.tsx    # client bootstrap (see §4)
        ├── entry-server.tsx    # HTML shell + theme init script
        ├── styles/
        │   └── global.css      # CSS vars (DW palette), reset, theme
        ├── data/
        │   ├── categories.json # 20 chips (committed)
        │   ├── regions.json    # 10 chips (committed)
        │   └── query-hashes.json   # generated at build time (§6)
        ├── lib/                # endpoint clients, sanitiser, profile store
        ├── components/         # cards, header, action bar, skeletons
        └── routes/
            ├── index.tsx               # /     onboarding
            ├── feed.tsx                # /feed  the reels-style loop
            ├── article/
            │   └── [contentId].tsx     # /article/:contentId
            ├── saved.tsx               # /saved
            └── [...404].tsx            # catch-all (renders same shell)
```

## 2. `app.config.ts`

App-shell SPA, no prerendered routes beyond `/` so GH Pages serves the
SPA from the root. `BASE_PATH` env var lets the same build deploy under
either a custom domain (`""`) or a repo subpath (`"/my-dw"`).

```ts
import { defineConfig } from "@solidjs/start/config";

const basePath = process.env.BASE_PATH || "";

export default defineConfig({
  vite: {
    build: { sourcemap: true },
  },
  server: {
    baseURL: basePath,
    preset: "static",
    prerender: {
      routes: ["/", "/404"],   // just the shell + 404 fallback
    },
  },
});
```

`BASE_PATH` flows into:
- Vite `base` (asset URLs).
- Vinxi `server.baseURL` (route prefix).
- `entry-server.tsx` `<base href>` tag.
- Any internal link constructors in the SPA.

## 3. `.github/workflows/deploy.yml`

Verified pattern. Builds with `BASE_PATH` set to the repo path when the
deploy target is a project-pages repo, empty when it's served from a
custom domain at the root.

```yaml
name: Deploy SPA to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Pre-register persisted GraphQL queries (see §6)
      - name: Register GraphQL persisted queries
        run: pnpm run register-hashes
        working-directory: solid-site

      - name: Build site
        run: pnpm build
        working-directory: solid-site
        env:
          # Repo serves at https://dumbnickname.github.io/my-dw-com/
          # so assets must be prefixed with the repo name.
          # Switch to '' if a custom domain (e.g. my.dw.com) is configured.
          BASE_PATH: /my-dw-com

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: solid-site/.output/public

      - id: deployment
        uses: actions/deploy-pages@v4
```

Substitute the `OWNER` placeholder. Add a `CNAME` file under `public/`
if pointing at a custom domain.

## 4. `entry-client.tsx`

Plain SolidStart default. **Do NOT** add the full-reload click handler
that forces `window.location.href = href` on every internal link — that
pattern exists for SSG sites where each route is a separately rendered
HTML document. We're an SPA. SolidJS router handles navigation.

```tsx
// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);
```

## 5. `scripts/copy-404.mjs` — SPA fallback on GitHub Pages

GitHub Pages serves `404.html` for any unknown path. Without this, a
direct hit to `/article/77527661` returns the Pages default 404. We want
the SPA shell to mount and route to it.

After build, Vinxi outputs the 404 route to `.output/public/404/index.html`.
GitHub Pages doesn't look in subdirectories — it wants `404.html` at the
root. So we copy:

```js
import { copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), ".output", "public");
const src = resolve(root, "404", "index.html");
const dst = resolve(root, "404.html");

try {
  await access(src);
  await copyFile(src, dst);
  console.log(`Copied 404.html for GH Pages SPA fallback.`);
} catch (e) {
  console.warn(`Skipped 404 copy: ${e.message}`);
}
```

Wire it in `package.json`:
```json
{
  "scripts": {
    "build": "vinxi build && node scripts/copy-404.mjs"
  }
}
```

The 404 route (`src/routes/[...404].tsx`) should render the same app
shell and let the client router resolve the path on the second tick. A
small "redirecting…" indicator is enough.

## 6. `scripts/register-graphql-hashes.mjs` — pre-build APQ registration

Why: the DW GraphQL endpoint accepts persisted queries via GET only after
they've been registered (POST once). Doing this at build time means the
very first user gets a CDN-cacheable GET. Mirrors the pattern in
`~/workshop/dw_libs/metadata/task.py`.

```js
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const ENDPOINT = "https://webapi.dw.com/graphql";

const QUERIES = {
  MyDwCard: `query MyDwCard($id: Int!, $lang: Language!) {
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
  }`,
  MyDwDetail: `query MyDwDetail($id: Int!, $lang: Language!) {
    content(id: $id, lang: $lang) {
      ... on ModelAspect { id modelType language }
      ... on NamedAspect { title }
      ... on TeaserAspect { roadTeaserKicker }
      ... on TextualAspect { shortTeaser teaser longTeaser text }
      ... on DeliveryAspect { contentDate validUntilDate }
      ... on MetadataAspect { genre lifetime }
      ... on AssociationsAspect {
        categories { name originId }
        regions { name originId }
        mainContentImage { staticUrl }
      }
      ... on UrlAspect { namedUrl }
      ... on PlaybackResourceAspect { formattedDurationInMinutes }
    }
  }`,
};

// Sample variables — content_id 77527661 is the verified test article.
const SAMPLE_VARS = { id: 77527661, lang: "ENGLISH" };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const hashes = {};
for (const [name, query] of Object.entries(QUERIES)) {
  const hash = sha256(query);
  const body = {
    query,
    variables: SAMPLE_VARS,
    extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apollo-require-preflight": "true" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Register ${name} failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.some((e) => e.message === "PersistedQueryNotFound")) {
    throw new Error(`Server did not register ${name}: ${JSON.stringify(json.errors)}`);
  }
  console.log(`Registered ${name} -> ${hash}`);
  hashes[name] = { hash, query };
}

const out = resolve("src/data/query-hashes.json");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(hashes, null, 2));
console.log(`Wrote ${out}`);
```

`package.json`:
```json
{
  "scripts": {
    "register-hashes": "node scripts/register-graphql-hashes.mjs"
  }
}
```

Run in CI before `pnpm build`, and locally during dev setup. Committing
the generated `query-hashes.json` is fine — the hashes are deterministic
from the query text. Re-run only when the queries change.

Runtime behaviour in the SPA:
- Always send GET with the hash.
- On `PersistedQueryNotFound`, fall back to POST register once, then
  retry GET. Cache the "registered" state per query in memory.

## 7. `entry-server.tsx` shell

Minimal HTML document. Includes a tiny inline script for theme
flash-prevention (reads `localStorage.mydw_theme` before paint).

```tsx
import { createHandler, StartServer } from "@solidjs/start/server";

const basePath = process.env.BASE_PATH || "";

const themeInitScript = `
  (function () {
    try {
      var stored = localStorage.getItem("mydw_theme");
      var pref = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", pref);
    } catch (e) {}
  })();
`;

export default createHandler(() => (
  <StartServer document={({ assets, children, scripts }) => (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <base href={basePath ? basePath + "/" : "/"} />
        <title>my.dw.com</title>
        <link rel="icon" href={`${basePath}/favicon.ico`} />
        <script innerHTML={themeInitScript} />
        {assets}
      </head>
      <body>
        <div id="app">{children}</div>
        {scripts}
      </body>
    </html>
  )} />
));
```

## 8. CSS theming pattern

CSS custom properties on `:root`, swapped via `[data-theme="dark"]`
selector. Palette tokens go straight from §3.6 of `03-grill-round-3.md`
(DW colours).

```css
/* src/styles/global.css */
:root {
  --color-bg:        #F0F6FA;   /* BLUE_GREY_01 */
  --color-surface:   #FFFFFF;
  --color-text:      #081336;   /* DARK_BLUE_GREY_01 */
  --color-text-mute: #5C718A;   /* BLUE_GREY_04 */
  --color-primary:   #002186;   /* DW_DARK_BLUE */
  --color-accent:    #05B2FC;   /* DW_LIGHT_BLUE */
  --color-yellow:    #FAE000;   /* DW_YELLOW — streak, like-active */
  --color-success:   #63DE9D;   /* ACCENT_GREEN — save-active */
  --color-skip:      #EF6C6C;   /* ACCENT_RED */
  --color-breaking:  #BE232D;   /* BREAKING_RED */
  --color-border:    #CDE1EE;   /* BLUE_GREY_02 */
}

[data-theme="dark"] {
  --color-bg:        #000821;   /* DARK_BLUE_GREY_02 */
  --color-surface:   #081336;   /* DARK_BLUE_GREY_01 */
  --color-text:      #F0F6FA;
  --color-text-mute: #99B5C9;   /* BLUE_GREY_03 */
  --color-primary:   #05B2FC;   /* light blue reads better on dark */
  --color-accent:    #FAE000;
  --color-border:    #445D7B;   /* BLUE_GREY_05 */
}
```

**Footgun** to avoid: tokens that "invert" (e.g. `--color-text` flipping
between near-black and near-white) break any always-dark element that
hardcodes one of them as a *background*. If you need an always-dark
panel (e.g. a "feature" card), hardcode the hex (`#081336`) and provide
an explicit `[data-theme="dark"]` override rather than reusing the token.

## 9. Domain / hosting notes

- **Remote**: `origin = https://github.com/dumbNickname/my-dw-com.git`
  (already configured locally; nothing pushed yet).
- **Default deploy URL**: `https://dumbnickname.github.io/my-dw-com/`
  — that's why `BASE_PATH=/my-dw-com` is set in §3.
- The PRD aspirationally targets `my.dw.com`. To use it later: add a
  `public/CNAME` file with `my.dw.com`, configure the DNS CNAME at
  `dw.com`, and change `BASE_PATH` to `""`.
- GitHub Pages serves only HTTPS. All external calls in this app
  (`webapi.dw.com`, `api.dedw.peach.ebu.io`) work over HTTPS — verified.
- No subresource-integrity blockers for cross-origin GraphQL/JSON.

## 10. Dependencies (suggested)

```json
{
  "dependencies": {
    "@solidjs/router": "^0.15.0",
    "@solidjs/start": "^1.1.0",
    "@solidjs/meta": "^0.29.0",
    "dompurify": "^3.2.0",
    "solid-js": "^1.9.0",
    "vinxi": "^0.5.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

Pin loosely; the SolidStart ecosystem moves. Use the latest minor at
scaffold time and lock with `pnpm-lock.yaml`.
