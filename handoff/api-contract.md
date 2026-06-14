# API contract — my.dw.com

All numbers here are **verified manually against live endpoints** during the
grilling session (June 2026). Treat as ground truth until proven otherwise.

## 1. PEACH recommendation API

Base: `http://api.dedw.peach.ebu.io` (HTTPS upgrade automatic on browser).
CORS: `Access-Control-Allow-Origin: *` returned when `Origin` header
present (always true from browser fetch).

Response envelope (all endpoints):
```json
{
  "status": "ok",
  "result": {
    "items": [{"content_id": "77527661", "model_type": "ARTICLE", "language": "ENGLISH", "views": 6175}],
    "id": "<opaque base64 ranker signature>",
    "fallback_used": "false"
  }
}
```

Only `result.items[].content_id` is consumed by the SPA. `model_type` is
optional UX (badge for VIDEO/LIVEBLOG).

### 1.1 `/v2/most-viewed`
Required: `lang`.
Optional: `amount` (default 20), `model_types` (CSV), `category` (CSV),
`region` (CSV), `country` (CSV), `safety`.

```
GET /v2/most-viewed?lang=ENGLISH&amount=10
```

### 1.2 `/v2/most-watched`
Required: `lang`. Optional: `amount`, `app_name`.

### 1.3 `/v2/trending_tz`
Required: `lang`, `timezone` (e.g. `Europe/Berlin`).
Optional: `amount`, `model_types`.

**Missing `timezone` → HTTP 500.** Always pass it.

```
GET /v2/trending_tz?lang=ENGLISH&timezone=Europe%2FBerlin&amount=20
```

### 1.4 `/v2/trending_by_category`
Optional but one required: `content_id` OR `origin_id`. Optional: `model_type`
(default `article`), `amount`.

Origin id values: see `src/data/categories.json` (e.g. `19990022` = Politics,
`19990031` = Technology). Pulled from redis dump in Round 3.

```
GET /v2/trending_by_category?origin_id=19990031&amount=10
```

### 1.5 `/v2/trending_by_region`
Same shape as 1.4. Origin id format: `region:europe:DE`, `region:global`, etc.
See `src/data/regions.json`.

### 1.6 `/v2/similar`
Required: `ids` (single content_id, despite plural name).
Optional: `lang`, `amount`, `model_type`, `categories`, `regions`.

```
GET /v2/similar?ids=77527661&lang=ENGLISH&amount=8
```

May return empty `items` for low-data content. Pool builder should tolerate.

### 1.7 `/v2/search` (text → similar content)
Required: `text`, `lang`. Optional: `amount`.

Use during onboarding to map free-text interests onto content. Not in MVP
onboarding (chips suffice) but ready for v1.1.

### 1.8 `/v2/untagger` (Smartocto user-need dimensions)
Required: `lang`, `dimension`. Optional: `min_score` (default `0`),
`amount` (default `20`).

Valid `dimension` values:
- `fact_driven` — hard news, breaking, factual reporting
- `context_driven` — explainers, analysis, deep dives
- `emotion_driven` — human interest, inspiring, delightful
- `action_driven` — practical advice, actionable takeaways

```
GET /v2/untagger?lang=ENGLISH&dimension=emotion_driven&min_score=40&amount=10
```

Response item shape (verified):
```json
{
  "content_id": "75503362",
  "score": 60,
  "fact_driven": {"score": 12, "update_me": 33, "keep_me_engaged": 67},
  "context_driven": {"score": 20, "break_it_down_for_me": 40, "give_me_perspective": 60},
  "emotion_driven": {"score": 60, "delight_me": 19, "inspire_me": 81},
  "action_driven": {"score": 8, "connect_me": 75, "give_me_an_edge": 25},
  "explanation": "This article is primarily Emotion-driven... (≈500 chars)"
}
```

Pool builder reads only `content_id`. **Drop `explanation`** on read to
keep memory and logs small.

### 1.9 `/v2/untagger_detail` (per-content dimension lookup)
Required: `content_id`. Returns the same per-dimension breakdown for a
single content. Called **fire-and-forget after a like** to accumulate
the user's dimension preference into `profile.dimension_pref`.

```
GET /v2/untagger_detail?content_id=77423104
```

### 1.10 Endpoints we will NOT use in MVP
- `/v2/similar_for_user`, `/v2/similar_for_content_by_user`,
  `/v2/collab_filter_duckdb` — all require `user_id` from `_pc_c` cookie
  which isn't available outside `dw.com` domains.
- `/v2/user_history` — same, requires PEACH user_id.
- `/v2/search_suggestions`, `/v2/trending_search` — out of scope for the
  reading-feed UX.

## 2. DW GraphQL content API

Base: `https://webapi.dw.com/graphql`
CORS: `Access-Control-Allow-Origin: *` (verified).
Schema gotcha: `content(id: Int!, lang: Language!)` — **cast `content_id`
string → int before sending**.

### 2.1 Card-fragment query (per content_id, for feed cards)

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
```

Verified response (id=77527661):
```json
{"data":{"content":{
  "id":77527661,"modelType":"ARTICLE","language":"ENGLISH",
  "title":"German court holds Google liable for fake AI answers",
  "teaser":"Judges in Bavaria drew a distinction...",
  "shortTeaser":"Judges in Bavaria ruled that tech giant are themselves responsible...",
  "categories":[{"name":"Law and Justice","originId":"19990025"},{"name":"Technology","originId":"19990031"}],
  "regions":[{"name":"Germany","originId":"region:europe:DE"}],
  "mainContentImage":{"staticUrl":"https://static.dw.com/image/77528576_${formatId}.jpg"},
  "namedUrl":"/en/german-court-holds-google-liable-for-fake-ai-answers/a-77527661",
  "roadTeaserKicker":"Law and Justice","contentDate":"2026-06-12T14:51:47.222Z"
}}}
```

### 2.2 Detail-fragment query (per content_id, for /article view)

Adds the body `text` and author/lifetime metadata to the card fragment:

```graphql
query MyDwDetail($id: Int!, $lang: Language!) {
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
}
```

### 2.3 Persisted query strategy

Both queries above are pre-hashed at build time. The client:

1. Always tries GET first:
   ```
   GET /graphql?variables={...}&extensions={"persistedQuery":{"version":1,"sha256Hash":"<hash>"}}
   ```
2. If response has `errors[0].message === "PersistedQueryNotFound"`,
   register via POST once:
   ```
   POST /graphql
   {
     "query": "<full query string>",
     "variables": {...},
     "extensions": {"persistedQuery": {"version":1, "sha256Hash": "<hash>"}}
   }
   ```
   Then retry GET.

Implementation pattern: mirror `~/workshop/dw_libs/metadata/task.py`'s
`_PersistedQueryClient`, ported to TS.

**Per-id cache hits across users** require GET URLs to be byte-identical for
the same id. Stable key ordering in JSON-stringified `variables` and
`extensions`.

## 3. Image URL resolution

`mainContentImage.staticUrl` contains a literal `${formatId}` placeholder
that we substitute client-side.

### 3.1 Format families (from the production webapp)

DW images come in **format groups**, each with multiple resolutions. The
format id is `<groupPrefix><resolutionIndex>` — e.g. `605` = group `60X`
(landscape 16:9), index `5` (1199px wide).

| Group  | Aspect ratio   | When to use                          |
|--------|----------------|--------------------------------------|
| `60X`  | landscape 16:9 | **default** — feed cards, hero       |
| `80X`  | square 1:1     | small thumbs, avatars, kicker images |
| `90X`  | mixed          | inline content, body figures         |
| `100X` | cinemascope    | wide hero (xl screens only)          |
| `110X` | vertical 9:16  | reserved (not in current content)    |
| `70X`  | portrait 3:4   | rare                                 |

Full ladder (verified against `~/own/dw/webapp/src/utils/imgUtils.js`):

```ts
export const FORMATS = {
  '60X': [  // landscape 16:9 — default
    { id: 600, width: 78   }, { id: 601, width: 201  },
    { id: 602, width: 379  }, { id: 603, width: 545  },
    { id: 604, width: 767  }, { id: 605, width: 1199 },
    { id: 606, width: 1568 }, { id: 607, width: 1920 },
  ],
  '80X': [  // square 1:1
    { id: 800, width: 50   }, { id: 801, width: 129  },
    { id: 802, width: 352  }, { id: 803, width: 575  },
    { id: 804, width: 767  }, { id: 805, width: 1024 },
    { id: 806, width: 1400 },
  ],
  '90X': [  // mixed aspect — inline body figures
    { id: 900, width: 48   }, { id: 901, width: 375  },
    { id: 902, width: 475  }, { id: 903, width: 600  },
    { id: 904, width: 768  }, { id: 905, width: 960  },
    { id: 906, width: 1110 },
  ],
  '100X': [  // cinemascope 16:7 — wide hero
    { id: 1000, width: 80   }, { id: 1001, width: 576  },
    { id: 1002, width: 768  }, { id: 1003, width: 992  },
    { id: 1004, width: 1200 }, { id: 1005, width: 1408 },
    { id: 1006, width: 1600 },
  ],
} as const;
```

### 3.2 Picking the right format

Pick the **smallest format whose width is ≥ the image's rendered CSS width × DPR**.
Mirrors what `~/own/dw/webapp/src/components/ResponsiveDwPicture/` does.

```ts
function pickFormatId(group: keyof typeof FORMATS, targetWidthPx: number): number {
  const ladder = FORMATS[group];
  const target = targetWidthPx * Math.min(globalThis.devicePixelRatio || 1, 2);
  return (ladder.find(f => f.width >= target) ?? ladder[ladder.length - 1]).id;
}

export function resolveImage(staticUrl: string, group: keyof typeof FORMATS, targetPx: number): string {
  const id = pickFormatId(group, targetPx);
  return staticUrl.replace('${formatId}', String(id));
}
```

Use `<picture>` with `srcset` if you want the browser to pick (preferred for
hero images). For simple cards a single `<img>` with computed format id is
fine — saves DOM and the size delta is minor.

### 3.3 MVP defaults
- **Onboarding carousel thumb**: group `80X`, target 200px → format `802` (352w).
- **Feed card hero (full-bleed mobile)**: group `60X`, target 400–800px → format
  `604` (767w) on phones, `605` (1199w) on desktop. Use `<picture>`.
- **Detail view hero**: group `60X`, target 1024px → format `605` (1199w).
- **Inline body figures** (in sanitised `text`): group `90X`, target 600px →
  format `903` (600w).
- **Video poster**: group `60X`, format `605`. Same as hero.

### 3.4 Safety net for missing formats
Some legacy content may not have all format-id renderings on the CDN. If an
image fails to load, fall back to `LEGACY` (id `4`) which is always present:

```html
<img src="..._605.jpg" onerror="this.src=this.src.replace(/_\d+\.jpg/, '_4.jpg')">
```

Worth a smoke test against ~10 random content_ids in M1 before final styling.

## 4. HTML sanitiser allow-list (for `text` body)

Tags kept:
- `p`, `h2`, `h3`, `ul`, `ol`, `li`, `em`, `strong`, `blockquote`, `br`, `hr`
- `figure`, `figcaption`, `img` (with `src` rewritten via `data-url` +
  `${formatId}` resolution; strip inline `style`)
- `a` — rewrite `href`:
  - `class="internal-link"` → prefix `https://www.dw.com`
  - `class="external-link"` → keep `href`, strip inline `<svg>` icon
  - All `<a>` get `target="_blank"` and `rel="noopener nofollow"`

Tags **removed and replaced with placeholder**:
- `div.vjs-wrapper.embed` (video player)
- `div.embed.dw-widget`
- `span.rich-text-ad`
- `div.embed[data-id]` (image galleries, etc.)
- Bare `<video>`, `<audio>`, `<iframe>`, `<script>`, `<style>`

Placeholder markup:
```html
<aside class="mydw-embed-placeholder">
  🎞 Embedded content — <a href="https://www.dw.com{namedUrl}" target="_blank" rel="noopener">view on dw.com →</a>
</aside>
```

All attributes except `href`, `src`, `alt`, `class` (allow-listed values
only) stripped. No `data-*`, no `on*` handlers, no `style`.

Library: use `dompurify` with a custom config or hand-roll with a small
sanitiser. `dompurify` is the safer choice for a hackathon.

## 5. Redis (read-only, taskwriter side — NOT called from SPA)

For reference / future dynamic chip generation. The SPA does **not** access
redis directly. Documenting because grilling discovered these:

- `dedw_v1_trending_by_category` — JSON map `{originId: [content...]}`.
  48 categories, dominant ones in `categories.json`.
- `dedw_v1_trending_by_region` — same shape. 176 regions.

These are the source of truth for the static chip list and the future
dynamic chip ranker.

## 6. Local profile schema

`localStorage["mydw_profile_v1"]`:

```ts
type Profile = {
  version: 1;
  langs: string[];                          // ["ENGLISH"] in MVP
  categories: Record<string, number>;       // {originId: weight}
  regions: Record<string, number>;
  dimension_pref: {                          // accumulated from untagger_detail on likes
    fact_driven: number;
    context_driven: number;
    emotion_driven: number;
    action_driven: number;
  };
  seen_ids: string[];                       // FIFO cap 500
  liked_ids: string[];
  saved_ids: string[];                      // surfaced in /saved
  skipped_ids: string[];                    // FIFO cap 200
  last_seed_id: string | null;
  streak: { current: number; last_day: string };  // ISO date YYYY-MM-DD
  cards_today: number;                      // resets on new local day
};
```

`dimension_pref` defaults to all zeros. On every like:
1. Add the card's `content_id` to `liked_ids`.
2. Fire-and-forget `GET /v2/untagger_detail?content_id=<id>`.
3. On response, for each of the 4 dimensions: `dimension_pref[dim] += score`.
4. Pool builder uses `dimension_pref[dim] + 5` as the sampling weight
   (the +5 floor keeps under-represented dimensions in rotation).
