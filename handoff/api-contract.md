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

### 1.1 `/v2/most-viewed`
- Required: `lang`.
- Optional: `amount` (default 20), `model_types` (CSV), `category`
  (CSV), `region` (CSV), `country` (CSV), `safety`.

```
GET /v2/most-viewed?lang=ENGLISH&amount=10
```

### 1.2 `/v2/most-watched`
- Required: `lang`.
- Optional: `amount`, `app_name`.

### 1.3 `/v2/trending_tz`
- Required: `lang`, `timezone` (e.g. `Europe/Berlin`).
- Optional: `amount`, `model_types`.
- **Missing `timezone` → HTTP 500.** Always pass it.

```
GET /v2/trending_tz?lang=ENGLISH&timezone=Europe%2FBerlin&amount=20
```

### 1.4 `/v2/trending_by_category`
- One required: `content_id` OR `origin_id`.
- Optional: `model_type` (default `article`), `amount`.
- Origin id values: `solid-site/src/data/categories.json` (e.g.
  `19990022` = Politics, `19990031` = Technology).
- Returns content across all languages (no `lang` filter).

```
GET /v2/trending_by_category?origin_id=19990031&amount=10
```

### 1.5 `/v2/trending_by_region`
Same shape as 1.4. Origin id format: `region:europe:DE`,
`region:global`, etc. See `solid-site/src/data/regions.json`.

### 1.6 `/v2/similar`
- Required: `ids` (single content_id, despite plural name).
- Optional: `lang`, `amount`, `model_type`, `categories`, `regions`.

```
GET /v2/similar?ids=77527661&lang=ENGLISH&amount=8
```

May return empty `items` for low-data content. Pool builder tolerates.

### 1.7 `/v2/search` (text → similar content)
- Required: `text`, `lang`. Optional: `amount`.
- Use case: future free-text onboarding (chips suffice today).

### 1.8 `/v2/untagger` (Smartocto user-need dimensions)
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

### 1.9 `/v2/untagger_detail` (per-content dimension lookup)
- Required: `content_id`.
- Returns the same per-dimension breakdown for a single content.
- M2 plan: called fire-and-forget after a like to accumulate the
  user's `dimension_pref` (see AGENTS.md §7).

```
GET /v2/untagger_detail?content_id=77423104
```

### 1.10 Endpoints we do NOT use

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
