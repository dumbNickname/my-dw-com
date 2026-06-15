/**
 * Profile = device-scoped state, persisted in localStorage.
 *
 * M0/M1 scope: stores only what's needed to render the cold-start pool
 * and dedup seen ids.
 *
 * M2 first slice (this iteration): likes + saves stored locally. Likes
 * are a pure count + per-id set so we can later derive a `dimension_pref`
 * map from them; for now they only feed the bottom-bar UI. Saves are an
 * ordered list (newest first) of {id, lang, title, kicker, image,
 * namedUrl} snapshots so the saved-list bottom-sheet can render without
 * a re-fetch even when offline.
 */

const KEY = "mydw_profile_v1";
const SEEN_CAP = 500;
const SAVED_CAP = 200;

export type SavedItem = {
  id: string;
  lang: string;
  title: string;
  kicker: string | null;
  image: string | null;
  namedUrl: string | null;
  ts: number;
};

export type Profile = {
  version: 1;
  langs: string[];
  categories: string[]; // selected origin ids
  regions: string[]; // selected origin ids
  seed_ids: string[]; // article ids tapped during onboarding
  seen_ids: string[]; // FIFO cap SEEN_CAP
  liked_ids: string[]; // article ids the user liked (set semantics, FIFO cap)
  saved: SavedItem[]; // newest-first, cap SAVED_CAP
};

const empty = (): Profile => ({
  version: 1,
  langs: ["ENGLISH"],
  categories: [],
  regions: [],
  seed_ids: [],
  seen_ids: [],
  liked_ids: [],
  saved: [],
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

/** Toggle a like on `id`. Idempotent; returns the new profile. */
export function toggleLike(p: Profile, id: string): Profile {
  const set = new Set(p.liked_ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  // Cap at SEEN_CAP too — likes are unlikely to ever hit it.
  const liked_ids = Array.from(set).slice(-SEEN_CAP);
  return { ...p, liked_ids };
}

export function isLiked(p: Profile, id: string): boolean {
  return p.liked_ids.includes(id);
}

/** Toggle a save. Idempotent. `snapshot` only used when adding. */
export function toggleSave(p: Profile, id: string, snapshot: Omit<SavedItem, "ts">): Profile {
  const idx = p.saved.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const saved = [...p.saved];
    saved.splice(idx, 1);
    return { ...p, saved };
  }
  const item: SavedItem = { ...snapshot, ts: Date.now() };
  const saved = [item, ...p.saved].slice(0, SAVED_CAP);
  return { ...p, saved };
}

export function isSaved(p: Profile, id: string): boolean {
  return p.saved.some((s) => s.id === id);
}
