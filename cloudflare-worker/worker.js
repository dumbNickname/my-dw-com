/**
 * my.dw.com — CORS shim for webapi.dw.com/graphql
 *
 * Why this exists:
 *   webapi.dw.com responds with Access-Control-Allow-Origin: * but its OPTIONS
 *   preflight returns HTTP 400 with no Allow-Methods / Allow-Headers. Browsers
 *   reject the preflight, so any cross-origin POST (or GET with a custom
 *   header like apollo-require-preflight) from the SPA fails. The Apollo
 *   GraphQL server also enforces CSRF protection that requires a custom
 *   header on GET requests, putting us between two walls.
 *
 *   This Worker is a stateless URL forwarder that fixes both problems:
 *     - It answers OPTIONS preflights with proper CORS headers.
 *     - It adds the apollo-require-preflight header server-side so Apollo
 *       accepts the request without involving the browser.
 *
 * What it is NOT:
 *   - It is not a backend. No state, no auth, no logic.
 *   - It does not transform responses (other than the Access-Control headers).
 *   - It can be removed in 30 seconds when webapi.dw.com fixes its CORS layer.
 *
 * Deploy:
 *   See README.md in this folder.
 */

const UPSTREAM = "https://webapi.dw.com/graphql";

// Allowed request headers on actual GET/POST. Keep this list tight.
const ALLOW_HEADERS = "content-type, apollo-require-preflight, x-apollo-operation-name";
const ALLOW_METHODS = "GET, POST, OPTIONS";

// Browser will cache the preflight for this many seconds.
const PREFLIGHT_MAX_AGE = "86400"; // 24h

// Edge cache TTL for actual responses. Per-content-id GET URLs are stable,
// so different users can hit the same cache entry.
const RESPONSE_CACHE_SECONDS = 300; // 5 min

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
    "Vary": "Origin",
  };
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const origin = request.headers.get("Origin");

    // 1. CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 2. Only forward GET and POST. Anything else: 405.
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // 3. Build upstream URL: copy the query string verbatim.
    const upstreamUrl = UPSTREAM + incoming.search;

    // 4. Build upstream request. apollo-require-preflight bypasses Apollo CSRF.
    const upstreamHeaders = new Headers();
    upstreamHeaders.set("apollo-require-preflight", "true");
    if (request.method === "POST") {
      const ct = request.headers.get("content-type");
      upstreamHeaders.set("content-type", ct || "application/json");
    }

    const upstreamReq = new Request(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === "POST" ? await request.text() : undefined,
    });

    let upstreamRes;
    try {
      upstreamRes = await fetch(upstreamReq);
    } catch (e) {
      return new Response(JSON.stringify({ error: "upstream_fetch_failed", detail: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // 5. Forward the response with CORS headers + a small edge cache hint.
    const body = await upstreamRes.text();
    const headers = new Headers();
    headers.set("Content-Type", upstreamRes.headers.get("content-type") || "application/json");
    headers.set("Cache-Control", `public, max-age=${RESPONSE_CACHE_SECONDS}`);
    for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);

    return new Response(body, { status: upstreamRes.status, headers });
  },
};
