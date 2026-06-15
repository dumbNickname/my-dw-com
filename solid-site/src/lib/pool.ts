/**
 * Pool = a per-session queue of (content_id, language) candidates the
 * feed will hand out.
 *
 * Each candidate carries its language because PEACH returns content in
 * many languages and the GraphQL `fetchCard(id, lang)` MUST be called
 * with the card's own language to get content back. The feed renders
 * the pool in queue order, so the user sees a natural mix of languages
 * from selected sources (FW4).
 *
 * Sources (per refill, fanned out across `profile.langs.slice(0, 3)`):
 *   1. `most-viewed?lang=X&categories=A,B,C` per lang — popularity
 *      bucket scoped to the user's onboarding-picked categories.
 *   2. `most-viewed?lang=X&regions=R,S` per lang — same shape for
 *      regions. Categories and regions can NOT be combined in one
 *      `most-viewed` call (Redis bucketing on the prod side); we issue
 *      separate calls and merge.
 *   3. `most-viewed?lang=X` per lang — unfiltered popularity baseline,
 *      a safety net so the feed never goes empty if the user's chips
 *      have thin buckets right now.
 *   4. `trending_tz?lang=X&timezone=...` per lang — fresh trending.
 *   5. `similar?ids=<seed>&lang=primary` per onboarding-tapped article
 *      and per recent like — explicit interest signals.
 *   6. `similar?ids=<recent_view>&lang=primary` per random recent
 *      view, ONLY when `seedFromRecent` is passed (the FW4b re-mine
 *      path). Implicit-interest signal — keeps the pool fresh on what
 *      the user is actually reading.
 *
 * Each refill is debounced via `state.refilling`. The 60s cache in
 * `peach.ts` collapses identical calls so back-to-back refills don't
 * burn quota.
 *
 * `REFILL_THRESHOLD` is intentionally generous (FW4b) so we start the
 * next batch well before the user can drain the queue.
 *
 * No source weighting yet — that's M2 proper (bandit).
 */
import * as peach from "./peach";
import type { Candidate } from "./peach";
import type { Profile } from "./profile";

const REFILL_THRESHOLD = 6;
const PER_SOURCE_AMOUNT = 8;
const LANG_FANOUT = 3;
const SEED_RECENT_AMOUNT = 3;
const SEED_LIKED_AMOUNT = 3;
const SEED_ONBOARDING_AMOUNT = 3;

export type PoolState = {
  queue: Candidate[];
  refilling: boolean;
};

export type RefillOpts = {
  /**
   * If provided, additionally seeds the refill with `peach.similar`
   * calls on a small random sample of these ids (the "re-mine" path).
   * Typically `profile.recent_view_ids`.
   */
  seedFromRecent?: string[];
};

export function createPool(): PoolState {
  return { queue: [], refilling: false };
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  return shuffle(arr).slice(0, n);
}

function langList(profile: Profile): string[] {
  const ls = profile.langs.length > 0 ? profile.langs : ["ENGLISH"];
  return ls.slice(0, LANG_FANOUT);
}

async function fetchCandidates(
  profile: Profile,
  opts: RefillOpts,
): Promise<Candidate[]> {
  const langs = langList(profile);
  const primaryLang = langs[0];
  const tz = peach.browserTimezone();

  const requests: Promise<Candidate[]>[] = [];

  for (const lang of langs) {
    // Categories bucket — popularity within the user's picked topics.
    if (profile.categories.length > 0) {
      requests.push(
        peach.mostViewed({
          lang,
          categories: profile.categories,
          amount: PER_SOURCE_AMOUNT,
        }),
      );
    }
    // Regions bucket — popularity within the user's picked regions.
    if (profile.regions.length > 0) {
      requests.push(
        peach.mostViewed({
          lang,
          regions: profile.regions,
          amount: PER_SOURCE_AMOUNT,
        }),
      );
    }
    // Unfiltered popularity baseline + fresh trending. Kept even when
    // chips are present so the feed never starves on a thin bucket.
    requests.push(peach.mostViewed({ lang, amount: PER_SOURCE_AMOUNT }));
    requests.push(peach.trendingTz(lang, tz, PER_SOURCE_AMOUNT));
  }

  // Onboarding-tapped articles → similar in their own language only.
  // (Each seed already has a language; cross-lang `similar` rarely
  // returns useful neighbours.)
  for (const seed of profile.seed_ids.slice(0, SEED_ONBOARDING_AMOUNT)) {
    requests.push(peach.similar(seed, primaryLang, PER_SOURCE_AMOUNT));
  }

  // Recently-liked articles → similar.
  for (const item of profile.liked.slice(0, SEED_LIKED_AMOUNT)) {
    requests.push(peach.similar(item.id, item.lang || primaryLang, PER_SOURCE_AMOUNT));
  }

  // FW4b re-mine: implicit-interest signal from what the user is
  // actually reading right now.
  if (opts.seedFromRecent && opts.seedFromRecent.length > 0) {
    const seeds = pickRandom(opts.seedFromRecent, SEED_RECENT_AMOUNT);
    for (const seedId of seeds) {
      requests.push(peach.similar(seedId, primaryLang, PER_SOURCE_AMOUNT));
    }
  }

  const settled = await Promise.allSettled(requests);
  const all: Candidate[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

/**
 * Refill the pool with new candidates, deduping against `seen_ids` and
 * the current queue, and filtering by the user's selected languages.
 * Returns a new state — does NOT mutate `state`.
 */
export async function refill(
  state: PoolState,
  profile: Profile,
  opts: RefillOpts = {},
): Promise<PoolState> {
  if (state.refilling) return state;
  state = { ...state, refilling: true };

  const seen = new Set(profile.seen_ids);
  const inQueue = new Set(state.queue.map((c) => c.id));
  const allowedLangs = new Set(langList(profile));

  const incoming = await fetchCandidates(profile, opts);

  const fresh: Candidate[] = [];
  const freshIds = new Set<string>();
  for (const c of shuffle(incoming)) {
    if (!c.id) continue;
    if (!allowedLangs.has(c.lang)) continue;
    if (seen.has(c.id)) continue;
    if (inQueue.has(c.id)) continue;
    if (freshIds.has(c.id)) continue;
    fresh.push(c);
    freshIds.add(c.id);
  }

  return {
    queue: [...state.queue, ...fresh],
    refilling: false,
  };
}

/**
 * Pop the next candidate off the pool. Caller is responsible for
 * calling refill() when the queue gets short (see `shouldRefill`).
 */
export function pop(state: PoolState): { candidate: Candidate | undefined; rest: PoolState } {
  if (state.queue.length === 0) return { candidate: undefined, rest: state };
  const [candidate, ...rest] = state.queue;
  return { candidate, rest: { ...state, queue: rest } };
}

export function shouldRefill(state: PoolState): boolean {
  return state.queue.length <= REFILL_THRESHOLD && !state.refilling;
}
