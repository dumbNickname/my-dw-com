/**
 * Profile = device-scoped state, persisted in localStorage.
 *
 * M0/M1 scope: stores only what's needed to render the cold-start pool
 * and dedup seen ids. Likes / saves / streak / dimension_pref ship in M2+.
 */

const KEY = "mydw_profile_v1";
const SEEN_CAP = 500;

export type Profile = {
  version: 1;
  langs: string[];
  categories: string[]; // selected origin ids
  regions: string[]; // selected origin ids
  seed_ids: string[]; // article ids tapped during onboarding
  seen_ids: string[]; // FIFO cap SEEN_CAP
};

const empty = (): Profile => ({
  version: 1,
  langs: ["ENGLISH"],
  categories: [],
  regions: [],
  seed_ids: [],
  seen_ids: [],
});

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export function load(): Profile {
  if (!isBrowser()) return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function save(p: Profile): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // localStorage may be full or blocked; ignore
  }
}

export function reset(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function markSeen(p: Profile, id: string): Profile {
  if (p.seen_ids.includes(id)) return p;
  const seen = [...p.seen_ids, id];
  if (seen.length > SEEN_CAP) seen.splice(0, seen.length - SEEN_CAP);
  return { ...p, seen_ids: seen };
}

export function isOnboarded(p: Profile): boolean {
  return p.categories.length > 0 || p.regions.length > 0 || p.seed_ids.length > 0;
}
