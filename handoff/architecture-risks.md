# Architecture risks discovered during grilling

These are surprises hit while validating endpoints. They constrain Round 3+
decisions and the eventual PRD.

## R1 — `webapi.dw.com/graphql` requires `id: Int!`, not `String!`
**Severity**: low (trivial fix).

PEACH endpoints return `content_id` as a **string** (`"77527661"`).
The public GraphQL schema declares `content(id: Int!, lang: Language!)`.

Action: cast in the SPA before calling. Single line.

## R2 — Persisted queries from a static SPA: hash-only GET works, registration
**Severity**: medium.

The DW webapp uses Apollo's `createPersistedQueryLink` which:
1. First sends the full query as POST.
2. Server registers it under sha256 hash.
3. Subsequent calls are GET-only with `?extensions={persistedQuery:{sha256Hash}}`.

For our SPA we have two options:

**Option A — register on demand** (mirrors `metadata/task.py`):
- First request POST, then switch to GET. Works, but the first request per
  device is uncacheable, and POST may not be allowed from browser at the
  edge if there's WAF protection.

**Option B — bake the hash + allow-listed query into the client**:
- Pre-register the exact query we use (run once from a script during build,
  capture the sha256, ship the hash in the bundle).
- Client always sends GET with the hash. If server replies
  `PersistedQueryNotFound`, we fall back to POST once.
- This is what gives us the per-content-id cache hits across users.

**Decision (proposed for Round 3)**: Option B. We ship one or two query hashes
total (a card-fragment query and a detail-fragment query). They're stable.

Verified manually: a POST query of our shape returns 200 with
`access-control-allow-origin: *`. So both options are viable.

## R3 — `mainContentImage.staticUrl` contains `${formatId}` placeholder
**Severity**: low.

Real value: `https://static.dw.com/image/77528576_${formatId}.jpg`.
The placeholder must be resolved client-side. Common formats from the
existing webapp: `701` (small), `940` (medium), `1024` (large), `605`
(video poster).

Action: implement a `resolveImageUrl(staticUrl, formatId)` util.

## R4 — `text` (body HTML) contains heavy embeds we won't render
**Severity**: medium (UX honesty issue, not technical).

Confirmed in a real article body:
- `<div class="vjs-wrapper embed big">` — videos
- `<div class="embed dw-widget">` — DW custom widgets
- `<span class="rich-text-ad">` — ad slots
- `<figure>` with `data-url` containing `${formatId}`
- `<a class="internal-link">` to other DW articles
- `<a class="external-link">` with inline SVG icons baked into anchor text

Action: aggressive sanitiser; unsupported embeds replaced with a clickable
"View on dw.com" placeholder. Canonical link + "Open original" button on
every detail view (already in Round 2).

## R5 — `trending_tz` requires `timezone` param; some endpoints 500 on missing required params
**Severity**: low.

The endpoint client must validate / provide all required params. Missing
`timezone` → 500. Build a small typed wrapper per endpoint.

## R6 — CORS verified for `*` only when `Origin` header is present
**Severity**: low (informational).

`api.dedw.peach.ebu.io` and `webapi.dw.com` both echo
`access-control-allow-origin: *` when an `Origin` header is sent. Browser
fetch always sends `Origin`, so we're fine. Don't pre-flight-trip with
exotic content types — `application/json` POST is fine for the GraphQL
register call.

## R7 — `_pc_c` cookie is not set on `*.github.io`
**Severity**: medium.

`collab_filter_duckdb` requires the Peach user_id from cookie `_pc_c`,
which is set by DW's Peach tracking on `dw.com` domains. Our SPA on
`*.github.io` will NOT have this cookie. So `similar_for_user` and
`collab_filter_duckdb` are effectively unavailable in MVP.

Workaround for PoC: skip those endpoints; rely on
`trending_tz` + `most-viewed` + `similar` (seeded by user's likes) +
`trending_by_category` / `trending_by_region` from onboarding picks.

Long-term (PM note): with a dedicated `my.dw.com` sitekey, we mint our own
device-id, send our own `media_play` / `page_view` events, and PEACH can
build CF over it. Out of MVP.

## R8 — webapi.dw.com cannot be called cross-origin from a browser
**Severity**: critical (blocks the entire content layer of the SPA).
**Status**: verified in a real headless Chromium during M0 implementation.
**Workaround in place**: Cloudflare Worker (see `cloudflare-worker/`).

### The trap
The DW GraphQL gateway combines two settings that, together, prevent any
browser-side cross-origin call:

1. Apollo Server's **CSRF protection** rejects any GET (and certain POSTs)
   that doesn't carry one of: `content-type: application/json`,
   `apollo-require-preflight: <any>`, `x-apollo-operation-name: <any>`.
2. The gateway's CORS layer returns `Access-Control-Allow-Origin: *` on the
   actual response but **does not** return `Access-Control-Allow-Methods`
   or `Access-Control-Allow-Headers` on the OPTIONS preflight. The preflight
   itself returns HTTP 400 with no allow-list. Browsers reject the
   preflight and never send the real request.

Bypassing the CSRF requires a non-simple header, which triggers a preflight,
which is rejected. There is no combination of (method, headers, content-type)
that satisfies both Apollo CSRF and the missing CORS allow-list.

Production DW does not hit this because the dw.com web app uses a same-origin
server-side proxy at `/graph-api/...` that forwards to `webapi.dw.com`.

### Verification (June 2026, captured during M0 build)
Tested with Chromium 1223 (Playwright) against `localhost:8765` origin:
- `GET ... + apollo-require-preflight: true` → CORS preflight blocked.
- `GET ... + x-apollo-operation-name: ...` → CORS preflight blocked.
- `POST application/json` → CORS preflight blocked.

All three error with `Response to preflight request doesn't pass access
control check: It does not have HTTP ok status`.

### Workaround (in repo)
A small Cloudflare Worker at `cloudflare-worker/worker.js` forwards requests
to `webapi.dw.com/graphql`, adds `apollo-require-preflight` server-side,
and responds to OPTIONS preflights with proper headers. Free tier covers
~50,000 card views per day. Reversible in 30 seconds.

The SPA reads its target URL from `VITE_GRAPHQL_BASE_URL` so the Worker URL
can be swapped to `https://webapi.dw.com/graphql` when DW's gateway is
fixed.

### Permanent fix (preferred long-term)
DW gateway config change: on the OPTIONS handler for `/graphql`, return:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: content-type, apollo-require-preflight, x-apollo-operation-name
Access-Control-Max-Age: 86400
```
Single change. Unblocks any browser-side experiment at DW. The Worker
becomes redundant and can be deleted.
