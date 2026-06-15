# API contract reference

The narrative parts of the original contract (profile schema, persisted
query strategy, image format ladder) are now in code and described in
the root `AGENTS.md`. This file is the **endpoint reference** — the
exact PEACH endpoints and the M3 sanitiser allow-list. Treat as ground
truth until proven otherwise.

Verified manually against live endpoints (June 2026).

---

## 1. PEACH recommendation API

Base: `https://api.dedw.peach.ebu.io`. CORS: `Access-Control-Allow-Origin: *`
returned when `Origin` header present (always true from a browser fetch).

Response envelope (all endpoints):

```json
{
  "status": "ok",
  "result": {
    "items": [
      {
        "content_id": "77527661",
        "model_type": "ARTICLE",
        "language": "ENGLISH",
        "views": 6175
      }
    ],
    "id": "<opaque base64 ranker signature>",
    "fallback_used": "false"
  }
}
```

The SPA only consumes `result.items[].content_id`. `model_type` is used
optionally for the language badge (`ARTICLE` / `VIDEO` / `LIVEBLOG`).

**Lang param convention** (gotcha): PEACH accepts the GraphQL `Language`
enum directly (`lang=ENGLISH`, `lang=GERMAN`). Lowercase ISO codes
(`lang=en`) return HTTP 200 but empty results. Don't lowercase, don't
translate.

### 1.1 `/v2/most-viewed` (the workhorse)

The primary popularity endpoint. Supports lang + topic + region
filtering in a single call via CSV parameters, and is what the SPA
uses for almost every cold-start fan-out.

- Required: none. With no filters, returns the unfiltered global top.
- Optional:
  - `lang` — GraphQL `Language` enum (`ENGLISH`, `GERMAN`, …). Omit
    for cross-lang results.
  - `amount` — default 20.
  - `categories` — CSV of category origin_ids
    (e.g. `categories=19990022,19990033` → Politics OR Science).
    See `solid-site/src/data/categories.json` (top 20 chips).
  - `regions` — CSV of region group names (`EUROPE`, `ASIA`, `AFRICA`,
    `ME`, `NORTHAMERICA`). See `solid-site/src/data/regions.json`.
    NOT the legacy `region:europe:DE` strings.
  - `countries` — CSV of two-letter country codes (`DE`, `FR`, `BR`).
  - `model_types` — CSV of `ARTICLE`, `VIDEO`, `AUDIO`, `LIVEBLOG`.
  - `safety` — `true` switches to a longer (7-day) window for
    sparser buckets.

```
GET /v2/most-viewed?lang=ENGLISH&categories=19990022,19990033&amount=10
GET /v2/most-viewed?lang=GERMAN&regions=EUROPE,ASIA&amount=20
```

**Param-name gotcha**: the parameter names are **plural**
(`categories`, `regions`, `countries`, `model_types`). Singular forms
(`category=...`) silently fall through to no-filter — easy to miss
because the response still has `fallback_used: false`. Match the
notebook function signature in
`~/workshop/dw_libs/popularity_commons/most_popular_endpoint.py`.

**Bucketing constraint**: `categories` and `regions` cannot be
combined in one call. The Redis bucket keys are
`(lang, model_type, category, region, country)` with at most one of
category / region / country populated. Passing both falls through to
the categories branch only. Issue two separate calls if you want both.

### 1.2 `/v2/most-watched`
- Required: `lang`. Optional: `amount`, `app_name`.

### 1.3 `/v2/trending_tz`
- Required: `lang`, `timezone` (e.g. `Europe/Berlin`).
- Optional: `amount`, `model_types`.
- **Missing `timezone` → HTTP 500.** Always pass it.

```
GET /v2/trending_tz?lang=ENGLISH&timezone=Europe%2FBerlin&amount=20
```

### 1.4 `/v2/similar`
- Required: `ids` (single content_id, despite plural name).
- Optional: `lang`, `amount`, `model_type`, `categories`, `regions`.

```
GET /v2/similar?ids=77527661&lang=ENGLISH&amount=8
```

May return empty `items` for low-data content. Pool builder tolerates.

### 1.5 `/v2/search` (text → similar content)
- Required: `text`, `lang`. Optional: `amount`.
- Use case: future free-text onboarding (chips suffice today).

### 1.6 Deprecated: `/v2/trending_by_category`, `/v2/trending_by_region`

These exist on the gateway and respond, but they read from a stale
Redis snapshot (~2022-era content_ids). The prod path replaces them
both with `/v2/most-viewed` + `categories=` / `regions=` CSV. Do not
use unless you have a specific reason to want the legacy snapshot.

### 1.7 `/v2/untagger` (Smartocto user-need dimensions)
- Required: `lang`, `dimension`.
- Optional: `min_score` (default `0`), `amount` (default `20`).

Valid `dimension` values:

| Dimension         | Meaning                                       |
|-------------------|-----------------------------------------------|
| `fact_driven`     | hard news, breaking, factual reporting        |
| `context_driven`  | explainers, analysis, deep dives              |
| `emotion_driven`  | human interest, inspiring, delightful         |
| `action_driven`   | practical advice, actionable takeaways        |

```
GET /v2/untagger?lang=ENGLISH&dimension=emotion_driven&min_score=40&amount=10
```

Response item shape (verified):

```json
{
  "content_id": "75503362",
  "score": 60,
  "fact_driven":    { "score": 12, "update_me": 33, "keep_me_engaged": 67 },
  "context_driven": { "score": 20, "break_it_down_for_me": 40, "give_me_perspective": 60 },
  "emotion_driven": { "score": 60, "delight_me": 19, "inspire_me": 81 },
  "action_driven":  { "score":  8, "connect_me": 75, "give_me_an_edge": 25 },
  "explanation": "This article is primarily Emotion-driven... (≈500 chars)"
}
```

Pool builder reads only `content_id`. **Drop `explanation`** on read to
keep memory and logs small.

### 1.8 `/v2/untagger_detail` (per-content dimension lookup)
- Required: `content_id`.
- Returns the same per-dimension breakdown for a single content.
- M2 plan: called fire-and-forget after a like to accumulate the
  user's `dimension_pref` (see AGENTS.md §7).

```
GET /v2/untagger_detail?content_id=77423104
```

### 1.9 Endpoints we do NOT use

Documented for completeness — these all require a PEACH `user_id` from
the `_pc_c` cookie, which is unavailable on `*.github.io` (see
`architecture-risks.md` R7):

- `/v2/similar_for_user`
- `/v2/similar_for_content_by_user`
- `/v2/collab_filter_duckdb`
- `/v2/user_history`

Out of scope today; unblocked if/when we get a dedicated `my.dw.com`
sitekey (`future-work.md` FW1).

Search-feature endpoints we don't need:
- `/v2/search_suggestions`, `/v2/trending_search`.

---

## 2. DW GraphQL content API

Base: `https://webapi.dw.com/graphql` (cross-origin block; we route
through the Cloudflare Worker — see AGENTS.md §3).

Schema gotchas:
- `content(id: Int!, lang: Language!)` — cast `content_id` string → int
  before sending. `lib/graphql.ts` does this.
- `lang` is the `Language` enum (`ENGLISH`, `GERMAN`, …), same value
  PEACH accepts.

The two queries the SPA registers — `MyDwCard` (per-card) and
`MyDwBody` (lazy on Expand) — are documented in AGENTS.md §4.3 with
their full text. The persistence + GET-first runtime strategy is in
AGENTS.md §4.3 too.

---

## 3. HTML sanitiser allow-list (M3, not yet implemented)

The `text` field on `MyDwBody.content.TextualAspect` is full DW article
HTML. Today (`lib/htmlText.ts`) it's stripped to plain paragraphs. The
M3 detail view will swap in DOMPurify with this allow-list:

### Tags kept
- Block: `p`, `h2`, `h3`, `ul`, `ol`, `li`, `blockquote`, `hr`, `br`
- Inline: `em`, `strong`
- Media: `figure`, `figcaption`, `img` (with `src` rewritten via
  `data-url` + `${formatId}` resolution; strip inline `style`)
- Links: `a` — rewrite `href`:
  - `class="internal-link"` → prefix `https://www.dw.com`
  - `class="external-link"` → keep `href`, strip inline `<svg>` icon
  - All `<a>` get `target="_blank"` and `rel="noopener nofollow"`

### Tags removed and replaced with placeholder
- `div.vjs-wrapper.embed` (video player)
- `div.embed.dw-widget`
- `span.rich-text-ad`
- `div.embed[data-id]` (image galleries, etc.)
- Bare `<video>`, `<audio>`, `<iframe>`, `<script>`, `<style>`

Placeholder markup:

```html
<aside class="mydw-embed-placeholder">
  🎞 Embedded content —
  <a href="https://www.dw.com{namedUrl}" target="_blank" rel="noopener">
    view on dw.com →
  </a>
</aside>
```

### Attribute policy

Strip everything except `href`, `src`, `alt`, and `class` (allow-listed
values only). No `data-*`, no `on*` handlers, no `style`.

### Library

Use `dompurify` with a custom config. Hand-rolling is a footgun for
adversarial HTML; DOMPurify is ~10KB gzipped and battle-tested.

---

## 4. Redis (read-only, taskwriter side — NOT called from the SPA)

For reference / future dynamic chip generation. The SPA does not access
Redis directly. Documented because grilling discovered these:

- `dedw_v1_trending_by_category` — JSON map `{originId: [content...]}`.
  48 categories total; the dominant ones live in
  `solid-site/src/data/categories.json` (top 20).
- `dedw_v1_trending_by_region` — same shape. 176 regions; top 10 in
  `solid-site/src/data/regions.json`.

These are the source of truth for the static chip list and a future
dynamic chip ranker (`future-work.md` FW10).
