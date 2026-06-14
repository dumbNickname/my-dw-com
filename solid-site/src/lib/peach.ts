/**
 * Thin client over DW PEACH recommendation API.
 *
 * All endpoints return { result: { items: [{content_id, ...}, ...] } }.
 * We only consume content_id (string). The browser sends an `Origin`
 * header automatically and the gateway echoes `access-control-allow-origin: *`.
 */

const BASE = "https://api.dedw.peach.ebu.io";

type RawItem = { content_id: string };
type RawEnvelope = { status?: string; result?: { items?: RawItem[] } };

async function call(path: string, params: Record<string, string | number | undefined>): Promise<string[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const url = `${BASE}${path}?${qs.toString()}`;
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
  return items.map((i) => String(i.content_id)).filter(Boolean);
}

export function mostViewed(lang: string, amount = 10): Promise<string[]> {
  return call("/v2/most-viewed", { lang, amount });
}

export function trendingTz(lang: string, timezone: string, amount = 10): Promise<string[]> {
  return call("/v2/trending_tz", { lang, timezone, amount });
}

export function trendingByCategory(originId: string, amount = 10): Promise<string[]> {
  return call("/v2/trending_by_category", { origin_id: originId, amount });
}

export function trendingByRegion(originId: string, amount = 10): Promise<string[]> {
  return call("/v2/trending_by_region", { origin_id: originId, amount });
}

export function similar(contentId: string, lang: string, amount = 8): Promise<string[]> {
  return call("/v2/similar", { ids: contentId, lang, amount });
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
