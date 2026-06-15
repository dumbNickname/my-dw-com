/**
 * Pool = a per-session queue of content_ids the feed will hand out.
 *
 * M1 scope: cold-start only.
 *   - Sources: trending_by_category (user picks), trending_by_region (user
 *     picks), `similar` seeded by onboarding-tapped articles. Falls back to
 *     trending_tz / most-viewed when those come back empty.
 *   - No source weighting, no bandit, no untagger. Those land in M2.
 *   - Dedup against profile.seen_ids (FIFO 500).
 *   - Refills automatically when running low.
 *
 * Per-source fetches run in parallel; the pool is a Set keyed by content_id
 * so duplicates collapse naturally.
 */
import * as peach from "./peach";
import type { Profile } from "./profile";

const REFILL_THRESHOLD = 3; // start refilling when fewer than this remain
const PER_SOURCE_AMOUNT = 8;

export type PoolState = {
  queue: string[]; // content_ids in display order
  lang: string;
  refilling: boolean;
};

export function createPool(lang: string): PoolState {
  return { queue: [], lang, refilling: false };
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchColdStartCandidates(profile: Profile): Promise<string[]> {
  const lang = profile.langs[0] || "ENGLISH";
  const tz = peach.browserTimezone();

  const requests: Promise<string[]>[] = [];

  // Onboarding categories → trending_by_category
  for (const cat of profile.categories.slice(0, 3)) {
    requests.push(peach.trendingByCategory(cat, PER_SOURCE_AMOUNT));
  }

  // Onboarding regions → trending_by_region
  for (const region of profile.regions.slice(0, 2)) {
    requests.push(peach.trendingByRegion(region, PER_SOURCE_AMOUNT));
  }

  // Onboarding-tapped articles → similar
  for (const seed of profile.seed_ids.slice(0, 3)) {
    requests.push(peach.similar(seed, lang, PER_SOURCE_AMOUNT));
  }

  // Recently liked articles → similar. Stronger signal than seed_ids
  // (explicit user action mid-session) so we boost off these too. The
  // `liked` array is newest-first, so .slice(0, 3) gives us the freshest
  // interests. Capped at 3 to keep total parallel fetches bounded.
  for (const item of profile.liked.slice(0, 3)) {
    requests.push(peach.similar(item.id, lang, PER_SOURCE_AMOUNT));
  }

  // Always include some freshness, even on rich profiles.
  requests.push(peach.trendingTz(lang, tz, PER_SOURCE_AMOUNT));

  // Fallback popularity baseline. Useful if everything above is empty.
  requests.push(peach.mostViewed(lang, PER_SOURCE_AMOUNT));

  const settled = await Promise.allSettled(requests);
  const all: string[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

/**
 * Refill the pool with new candidates, deduping against seen_ids and the
 * current queue. Returns the new queue (does NOT mutate `state`).
 */
export async function refill(state: PoolState, profile: Profile): Promise<PoolState> {
  if (state.refilling) return state;
  const next: PoolState = { ...state, refilling: true };

  const seen = new Set(profile.seen_ids);
  const inQueue = new Set(state.queue);
  const incoming = await fetchColdStartCandidates(profile);

  const fresh: string[] = [];
  for (const id of shuffle(incoming)) {
    if (!id) continue;
    if (seen.has(id)) continue;
    if (inQueue.has(id)) continue;
    if (fresh.includes(id)) continue;
    fresh.push(id);
  }

  return {
    ...next,
    queue: [...state.queue, ...fresh],
    refilling: false,
  };
}

/**
 * Pop the next id off the pool. Caller is responsible for calling refill()
 * when the queue gets short.
 */
export function pop(state: PoolState): { id: string | undefined; rest: PoolState } {
  if (state.queue.length === 0) return { id: undefined, rest: state };
  const [id, ...rest] = state.queue;
  return { id, rest: { ...state, queue: rest } };
}

export function shouldRefill(state: PoolState): boolean {
  return state.queue.length <= REFILL_THRESHOLD && !state.refilling;
}

// Used in M2+ for dedicated "similar to last liked" boosts. Exported so the
// feed route can call it directly when it wants more variety.
export async function similarTo(contentId: string, lang: string): Promise<string[]> {
  return peach.similar(contentId, lang, PER_SOURCE_AMOUNT);
}

// Re-export for convenience.
export { pickRandom };
