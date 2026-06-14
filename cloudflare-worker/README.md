# mydw-gw — CORS shim Worker

A 70-line Cloudflare Worker that forwards requests to
`https://webapi.dw.com/graphql` with proper CORS preflight responses and the
`apollo-require-preflight` header attached server-side. Removes the two walls
that block the SPA from talking to DW's GraphQL API directly:

1. `webapi.dw.com` returns no `Access-Control-Allow-Methods` /
   `Access-Control-Allow-Headers` on its OPTIONS preflight, so any
   cross-origin POST (or GET with a custom header) fails in the browser.
2. Apollo Server's CSRF protection requires a custom header on GET, which
   forces a preflight that DW doesn't answer.

Verified manually (June 2026) with headless Chromium against `localhost:8765`
that the direct path is blocked. This Worker is a temporary fix until DW's
gateway gets `Access-Control-Allow-Methods: GET, POST, OPTIONS` and
`Access-Control-Allow-Headers: content-type, apollo-require-preflight`.

---

## When to use the Worker vs. the direct endpoint

Set `VITE_GRAPHQL_BASE_URL` in `solid-site/.env` (and the GitHub Actions
deploy workflow) to:

- The Worker URL (e.g. `https://mydw-gw.<your-handle>.workers.dev`) while
  `webapi.dw.com` preflight is broken.
- `https://webapi.dw.com/graphql` once DW widens CORS.

The SPA code is identical in both cases; just the env var changes.

---

## What the Worker is NOT

- It is **not** a backend. No state, no DB, no auth, no app logic.
- It does **not** transform GraphQL responses other than rewriting the
  CORS headers and adding a short `Cache-Control`.
- It does **not** introduce any abuse vector — `webapi.dw.com/graphql`
  is already public; this Worker just forwards through with browser-
  compatible headers.
- It can be deleted in 30 seconds without touching the SPA other than
  the env var.

---

## Free tier reality check (as of 2025/2026)

Cloudflare Workers free tier:

- **100,000 requests per day** (resets at UTC midnight).
- **10 ms CPU time per request** — we use ~1 ms.
- **No bandwidth limit** on the free tier.
- **Free SSL, free DDoS protection.**
- **No credit card required.**

Each card render = ~2 requests (one preflight cached for 24h, one actual
GraphQL call). Practically: ~50,000 card views per day before hitting the
ceiling. Edge cache (`Cache-Control: max-age=300` set by the Worker) means
repeat hits for the same content_id come from Cloudflare's cache and do
not count against the request budget.

If you ever outgrow this, the paid plan is $5/month for 10M requests.

---

## Deploy via Cloudflare dashboard (no CLI, fastest)

1. Sign up at <https://dash.cloudflare.com/sign-up> (free, 2 minutes,
   email + password).
2. Sidebar: **Workers & Pages** → **Create** → **Create Worker**.
3. Pick a name (e.g. `mydw-gw`). The URL will be
   `https://mydw-gw.<your-handle>.workers.dev`.
4. Click **Deploy** on the default Hello World, then **Edit code**.
5. Replace the editor contents with the contents of `worker.js` from
   this folder. Save. Click **Deploy**.
6. Verify it works:

   ```bash
   curl -sS "https://mydw-gw.<your-handle>.workers.dev?operationName=ping" \
        -H "Origin: https://example.github.io" \
        -X OPTIONS -I
   # Should return HTTP 204 with Access-Control-Allow-Methods present.
   ```

7. Tell the project where to find it:
   - Locally: edit `solid-site/.env.local`:
     ```
     VITE_GRAPHQL_BASE_URL=https://mydw-gw.<your-handle>.workers.dev
     ```
   - In GitHub Actions: set the same env var in the deploy workflow
     (`.github/workflows/deploy.yml`) under the build step.

---

## Deploy via Wrangler (if you prefer CLI)

```bash
# In this folder (cloudflare-worker/):
npm install -g wrangler          # one-off
wrangler login                   # opens browser, logs into Cloudflare
wrangler deploy                  # uses wrangler.toml
```

Output gives you the workers.dev URL. Plug it into `VITE_GRAPHQL_BASE_URL`
the same way.

---

## Sanity test against the live SPA

After the env var is set and the SPA is redeployed, a single card render
should produce two requests in DevTools Network tab:

1. `OPTIONS` to the Worker → `204` with `access-control-allow-methods` set.
2. `GET` to the Worker → `200` with the GraphQL `data.content` payload.

If you see `(failed) net::ERR_FAILED` or `CORS error`, the env var didn't
take effect during build — check the build logs.

---

## When DW widens CORS on webapi.dw.com

Swap `VITE_GRAPHQL_BASE_URL` back to `https://webapi.dw.com/graphql`.
Verify in DevTools that the requests now go direct. Then delete the Worker
from the Cloudflare dashboard (or just stop deploying it). No code change.
