# Architecture risks

The original risk log had R1–R8. Six of them were resolved in code during
M0/M1/M2-slice and are no longer worth tracking:

| Was   | Resolution |
|-------|------------|
| R1    | `lib/graphql.ts` casts `content_id` string → int before sending. |
| R2    | `scripts/register-graphql-hashes.mjs` pre-registers at build time; `lib/graphql.ts` runtime-registers as fallback. Both paths verified. |
| R3    | `lib/image.ts` resolves `${formatId}` against the format ladder. Snapshots are resolved at write-time (see AGENTS.md §4.4). |
| R4    | `lib/htmlText.ts` strips all HTML to plain paragraphs. Real fix (DOMPurify allow-list) is M3 — see AGENTS.md §4.7. |
| R5    | `lib/peach.ts` typed wrappers always pass required params (incl. `timezone`). |
| R6    | Verified during build: PEACH echoes `Access-Control-Allow-Origin: *`. webapi.dw.com does NOT — that's R8. |

Two risks remain.

---

## R7 — `_pc_c` cookie unavailable on `*.github.io`

**Severity**: medium. **Status**: documented, MVP works around it.

PEACH's collaborative-filter endpoints
(`/v2/similar_for_user`, `/v2/similar_for_content_by_user`,
`/v2/collab_filter_duckdb`, `/v2/user_history`) require a PEACH
`user_id`, sourced from the `_pc_c` cookie set by Peach tracking on
`dw.com` domains. Our SPA on `dumbnickname.github.io` has no way to
read or mint this cookie cross-origin.

**MVP workaround** (in code): the pool builder in `lib/pool.ts` skips
all `*_for_user` endpoints and relies on:
- `trending_by_category` / `trending_by_region` from onboarding picks,
- `similar` seeded by onboarding-tapped articles AND by recently liked
  articles (`profile.liked.slice(0, 3)`),
- `trending_tz` + `most-viewed` for freshness / fallback.

**Long-term fix**: a dedicated `my.dw.com` PEACH sitekey, the SPA mints
its own device UUID, and we send our own `card_view` / `like` / `save`
events. Then PEACH can build CF over a clean per-app event stream. See
`future-work.md` FW1 + FW2.

Not a hackathon blocker. The cold-start pool is good enough without CF.

---

## R8 — webapi.dw.com cannot be called cross-origin from a browser

**Severity**: critical. **Status**: workaround in production
(Cloudflare Worker), permanent fix is one DW gateway config change.

### The trap

DW's GraphQL gateway combines two settings that, together, prevent any
browser-side cross-origin call:

1. **Apollo Server CSRF protection** rejects any GET (and certain POSTs)
   that doesn't carry one of `content-type: application/json`,
   `apollo-require-preflight: <any>`, or `x-apollo-operation-name: <any>`.
2. **CORS preflight** returns HTTP 400 with no
   `Access-Control-Allow-Methods` / `-Headers`. Browsers reject the
   preflight, so the real request is never sent.

There's no (method, headers, content-type) combination that satisfies
both Apollo CSRF and the missing CORS allow-list. Production `dw.com`
sidesteps this with a same-origin server proxy at `/graph-api/`. Our SPA
can't.

Verified during M0 build with headless Chromium:
- `GET ... + apollo-require-preflight: true` → preflight blocked.
- `GET ... + x-apollo-operation-name: ...` → preflight blocked.
- `POST application/json` → preflight blocked.

All three error with `Response to preflight request doesn't pass access
control check: It does not have HTTP ok status`.

### Workaround in place

`cloudflare-worker/worker.js` (~70 LOC) is a stateless URL forwarder:
- Forwards GET / POST to `https://webapi.dw.com/graphql` with the
  `apollo-require-preflight` header attached server-side.
- Answers OPTIONS preflights with the right
  `Access-Control-Allow-Methods` / `-Headers`.
- Adds a 5-min `Cache-Control` so per-content-id GETs hit the edge
  cache.

Free tier: 100k req/day, ~50k card views/day in practice (each card =
~2 requests with preflight cached). Live at
`https://mydw-api.impalatab.workers.dev/`.

Reversible in 30 seconds: delete the Worker from Cloudflare's dashboard,
point `VITE_GRAPHQL_BASE_URL` at `webapi.dw.com/graphql` directly. No
SPA code change.

### Permanent fix (preferred long-term)

Single change on the DW gateway: on the OPTIONS handler for `/graphql`,
return:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: content-type, apollo-require-preflight, x-apollo-operation-name
Access-Control-Max-Age: 86400
```

This unblocks any browser-side experiment at DW, not just this app. The
Worker becomes redundant and gets deleted.
