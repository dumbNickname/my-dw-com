/**
 * Thin client over the production DW PEACH recommendation API.
 *
 * Endpoint inventory (all under https://api.dedw.peach.ebu.io/v2):
 *   /most-viewed   — popularity baseline; filters by lang + categories
 *                    + regions (CSV); returns mixed-language content
 *                    when no `lang` filter passed.
 *   /trending_tz   — fresh trending in a timezone, language-aware.
 *   /similar       — semantic neighbours of a content_id.
 *
 * The legacy /trending_by_category and /trending_by_region endpoints
 * are intentionally NOT used — they read from a stale Redis snapshot
 * (~2022-era content_ids). The prod /most-viewed already supports
 * category and region filtering via the `categories=` and `regions=`
 * CSV parameters and reads from fresh per-bucket Redis keys.
 *
 * `categories` accepts a CSV of category origin_ids (e.g.
 *   `categories=19990022,19990033` → Politics OR Science).
 *
 * `regions` accepts a CSV of region group names (`EUROPE`, `ASIA`,
 * `AFRICA`, `ME`, `LATAM`, `NORTHAMERICA`, ...). NOT the legacy
 * `region:europe:DE` strings — those are the older endpoint's IDs.
 *
 * Per the prod notebook (~/workshop/dw_libs/popularity_commons/
 * most_popular_endpoint.py), categories and regions cannot be combined
 * in one call: the Redis bucket keys are
 * `(lang, model_type, category, region, country)` with at most ONE of
 * category / region / country populated. Passing both falls through
 * to the categories branch only. So callers wanting both should issue
 * two separate calls.
 *
 * The browser sends `Origin` automatically and PEACH echoes
 * `Access-Control-Allow-Origin: *`.
 *
 * In-memory 60s cache: identical (endpoint, params) calls within 60s
 * return the cached result, so back-to-back pool refills don't burn
 * quota. PEACH responses are time-stable for at least that long for
 * our use cases.
 */

const BASE = "https://api.dedw.peach.ebu.io";

const CACHE_TTL_MS = 60_000;

export type Candidate = { id: string; lang: string };

type RawItem = { content_id: string; language?: string };
type RawEnvelope = { status?: string; result?: { items?: RawItem[] } };

type CacheEntry = { ts: number; value: Candidate[] };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): Candidate[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: Candidate[]): void {
  cache.set(key, { ts: Date.now(), value });
}

async function call(
  path: string,
  params: Record<string, string | number | undefined>,
  fallbackLang: string,
): Promise<Candidate[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const url = `${BASE}${path}?${qs.toString()}`;

  const cached = cacheGet(url);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error("[peach] network error", path, e);
    return [];
  }
  if (!res.ok) {
    console.warn("[peach] non-ok", path, res.status);
    return [];
  }
  let json: RawEnvelope;
  try {
    json = (await res.json()) as RawEnvelope;
  } catch {
    return [];
  }
  const items = json?.result?.items ?? [];
  const candidates: Candidate[] = items
    .filter((i) => i.content_id)
    .map((i) => ({ id: String(i.content_id), lang: i.language || fallbackLang }));

  cacheSet(url, candidates);
  return candidates;
}

export type MostViewedOpts = {
  /** GraphQL Language enum value (e.g. "ENGLISH"). Omit for cross-lang. */
  lang?: string;
  amount?: number;
  /** Category origin_ids; CSV-joined into `categories=`. */
  categories?: string[];
  /**
   * Region group names (`EUROPE`, `ASIA`, ...); CSV-joined into `regions=`.
   * Cannot be combined with `categories` in the same call (PEACH-side
   * exclusion); issue two calls if you want both.
   */
  regions?: string[];
  /** Two-letter country codes; CSV-joined into `countries=`. */
  countries?: string[];
  /** Filter by content type (ARTICLE / VIDEO / AUDIO / LIVEBLOG). */
  modelTypes?: string[];
};

export function mostViewed(opts: MostViewedOpts = {}): Promise<Candidate[]> {
  return call(
    "/v2/most-viewed",
    {
      lang: opts.lang,
      amount: opts.amount ?? 10,
      categories: opts.categories?.join(",") || undefined,
      regions: opts.regions?.join(",") || undefined,
      countries: opts.countries?.join(",") || undefined,
      model_types: opts.modelTypes?.join(",") || undefined,
    },
    opts.lang || "ENGLISH",
  );
}

export function trendingTz(lang: string, timezone: string, amount = 10): Promise<Candidate[]> {
  return call("/v2/trending_tz", { lang, timezone, amount }, lang);
}

export function similar(contentId: string, lang: string, amount = 8): Promise<Candidate[]> {
  return call("/v2/similar", { ids: contentId, lang, amount }, lang);
}

/**
 * Best-effort browser timezone, falling back to Europe/Berlin (PEACH default).
 */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  } catch {
    return "Europe/Berlin";
  }
}
