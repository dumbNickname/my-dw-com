/**
 * GraphQL client for webapi.dw.com using Apollo APQ semantics.
 *
 * Strategy:
 *   1. Always try GET with the sha256 hash. Cacheable per (id, lang).
 *   2. On `PersistedQueryNotFound`, POST register once, then retry GET.
 *
 * Hashes are pre-registered at build time by
 * scripts/register-graphql-hashes.mjs and shipped in src/data/query-hashes.json.
 *
 * In-memory cache keyed by (queryName, id, lang) for the session — the
 * browser HTTP cache covers cross-session reuse.
 */
import hashesJson from "~/data/query-hashes.json";

const ENDPOINT = (import.meta.env.VITE_GRAPHQL_BASE_URL || "https://example.invalid/graphql").replace(/\/$/, "");

type HashEntry = { hash: string; query: string };
const HASHES = hashesJson as Record<string, HashEntry>;

// Track which queries are known-registered with the server.
const registered = new Set<string>(Object.keys(HASHES));

const sessionCache = new Map<string, unknown>();

type Variables = Record<string, unknown>;

function buildGetUrl(name: string, variables: Variables): string {
  const entry = HASHES[name];
  const params = new URLSearchParams({
    operationName: name,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: entry.hash },
    }),
  });
  return `${ENDPOINT}?${params.toString()}`;
}

async function postRegister(name: string, variables: Variables): Promise<unknown> {
  const entry = HASHES[name];
  const body = {
    operationName: name,
    query: entry.query,
    variables,
    extensions: { persistedQuery: { version: 1, sha256Hash: entry.hash } },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apollo-require-preflight": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GraphQL ${name} POST register HTTP ${res.status}`);
  const json = await res.json();
  registered.add(name);
  return json;
}

function isPersistedQueryMissing(json: { errors?: { message: string }[] } | null | undefined): boolean {
  return Boolean(json?.errors?.some((e) => e.message === "PersistedQueryNotFound"));
}

async function execute<T>(name: string, variables: Variables): Promise<T | null> {
  if (!HASHES[name]) {
    throw new Error(`Unknown persisted query: ${name}. Run pnpm register-hashes.`);
  }
  const cacheKey = `${name}:${JSON.stringify(variables)}`;
  if (sessionCache.has(cacheKey)) return sessionCache.get(cacheKey) as T;

  const tryGet = async () => {
    const res = await fetch(buildGetUrl(name, variables));
    if (!res.ok) throw new Error(`GraphQL ${name} GET HTTP ${res.status}`);
    return (await res.json()) as { data?: T; errors?: { message: string }[] };
  };

  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = await tryGet();
    if (isPersistedQueryMissing(json)) {
      const registerJson = (await postRegister(name, variables)) as typeof json;
      if (registerJson?.data) {
        json = registerJson;
      } else {
        json = await tryGet();
      }
    }
  } catch (e) {
    console.error(`[graphql] ${name} failed`, e);
    return null;
  }

  if (json?.errors?.length) {
    console.warn(`[graphql] ${name} returned errors`, json.errors);
  }
  if (!json?.data) return null;
  sessionCache.set(cacheKey, json.data);
  return json.data;
}

export type CardContent = {
  id: number;
  modelType: string;
  language: string;
  title: string | null;
  shortTeaser: string | null;
  teaser: string | null;
  roadTeaserKicker: string | null;
  contentDate: string | null;
  categories: { name: string; originId: string }[] | null;
  regions: { name: string; originId: string }[] | null;
  mainContentImage: { staticUrl: string } | null;
  namedUrl: string | null;
  formattedDurationInMinutes: string | null;
  duration: number | null;
  hlsVideoSrc: string | null;
  mp3Src: string | null;
  extendedGalleryImages: { name: string; description: string; assignedImage: { staticUrl: string } | null }[] | null;
};

type CardResponse = { content: CardContent | null };

export async function fetchCard(contentId: string, lang: string): Promise<CardContent | null> {
  const id = Number(contentId);
  if (!Number.isFinite(id)) return null;
  const data = await execute<CardResponse>("MyDwCard", { id, lang });
  return data?.content ?? null;
}

type BodyResponse = { content: { id: number; text: string | null } | null };

/**
 * Lazily fetch the article body HTML for an already-rendered card. Only
 * called when the user taps "Expand" — keeps the per-card payload small.
 * Result is memoised by (id, lang) in the session cache, so re-expanding
 * the same card is free.
 */
export async function fetchBody(contentId: string | number, lang: string): Promise<string | null> {
  const id = Number(contentId);
  if (!Number.isFinite(id)) return null;
  const data = await execute<BodyResponse>("MyDwBody", { id, lang });
  return data?.content?.text ?? null;
}

export type WidgetData = {
  embedCode: string | null;
  widgetType: string | null;
  graphicType: string | null;
};

const WIDGET_QUERY = `query MyDwWidget($id: Int!, $lang: Language!) {
  content(id: $id, lang: $lang) {
    ... on Widget { id embedCode widgetType graphicType }
  }
}`;

const widgetCache = new Map<string, WidgetData | null>();

export async function fetchWidget(contentId: number, lang: string): Promise<WidgetData | null> {
  const key = `widget:${contentId}:${lang}`;
  if (widgetCache.has(key)) return widgetCache.get(key)!;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apollo-require-preflight": "true",
      },
      body: JSON.stringify({ query: WIDGET_QUERY, variables: { id: contentId, lang } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json?.data?.content;
    if (!content) { widgetCache.set(key, null); return null; }
    const data: WidgetData = {
      embedCode: content.embedCode ?? null,
      widgetType: content.widgetType ?? null,
      graphicType: content.graphicType ?? null,
    };
    widgetCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}
