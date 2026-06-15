/**
 * Profile = device-scoped state, persisted in localStorage.
 *
 * M0/M1 scope: stores only what's needed to render the cold-start pool
 * and dedup seen ids.
 *
 * M2 first slice: likes + saves with offline snapshots. Both lists
 * mirror each other (`SavedItem` / `LikedItem` shapes), so the library
 * sheet can render them with the same row component. Toggle helpers
 * keep the snapshot list in sync with the id-set so we never end up
 * with orphan snapshots or orphan ids.
 *
 * `liked_ids` is kept around for backward compatibility with the
 * previous schema (and as a fast-path membership check in the action
 * bar); on every save/like toggle we rebuild it from the snapshot
 * arrays, so it stays consistent.
 */

const KEY = "mydw_profile_v1";
const SEEN_CAP = 500;
const RECENT_VIEW_CAP = 20;
const LIBRARY_CAP = 200;

export type LibraryItem = {
  id: string;
  lang: string;
  title: string;
  kicker: string | null;
  image: string | null;
  namedUrl: string | null;
  ts: number;
};

export type SavedItem = LibraryItem;
export type LikedItem = LibraryItem;

export type Profile = {
  version: 1;
  langs: string[];
  categories: string[]; // selected origin ids
  regions: string[]; // selected origin ids
  seed_ids: string[]; // article ids tapped during onboarding
  seen_ids: string[]; // FIFO cap SEEN_CAP — permanent dedup
  recent_view_ids: string[]; // FIFO cap RECENT_VIEW_CAP — rolling re-mine seed
  liked_ids: string[]; // mirrors `liked` for fast membership checks
  liked: LikedItem[]; // newest-first, cap LIBRARY_CAP
  saved: SavedItem[]; // newest-first, cap LIBRARY_CAP
};

const empty = (): Profile => ({
  version: 1,
  langs: ["ENGLISH"],
  categories: [],
  regions: [],
  seed_ids: [],
  seen_ids: [],
  recent_view_ids: [],
  liked_ids: [],
  liked: [],
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
    // Notify any in-page subscriber (the app footer's library badge,
    // currently). Cross-page sync via the native `storage` event would
    // also work but doesn't fire on the same page that made the write.
    window.dispatchEvent(new CustomEvent("mydw:profile-change"));
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

/**
 * Push `id` to the front of the recent-view window (newest-first), cap
 * at RECENT_VIEW_CAP. Distinct from `seen_ids`: this is a rolling
 * signal of what the user is currently reading, used to seed
 * mid-session `peach.similar` re-mining. Re-rendering the same article
 * (e.g. opening from the library) bumps it back to the front.
 */
export function markViewed(p: Profile, id: string): Profile {
  const without = p.recent_view_ids.filter((x) => x !== id);
  const next = [id, ...without].slice(0, RECENT_VIEW_CAP);
  return { ...p, recent_view_ids: next };
}

export function isOnboarded(p: Profile): boolean {
  return p.categories.length > 0 || p.regions.length > 0 || p.seed_ids.length > 0;
}

/**
 * Toggle membership of `id` in a snapshot list. If the id is present,
 * remove it. Otherwise prepend `snapshot` (with `ts` filled in) and
 * trim to LIBRARY_CAP. Pure; returns the new list.
 */
function toggleInList(
  list: LibraryItem[],
  id: string,
  snapshot: Omit<LibraryItem, "ts">,
): LibraryItem[] {
  const idx = list.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const next = [...list];
    next.splice(idx, 1);
    return next;
  }
  return [{ ...snapshot, ts: Date.now() }, ...list].slice(0, LIBRARY_CAP);
}

/** Toggle a like. Idempotent. `snapshot` only used when adding. */
export function toggleLike(p: Profile, id: string, snapshot: Omit<LibraryItem, "ts">): Profile {
  const liked = toggleInList(p.liked, id, snapshot);
  return { ...p, liked, liked_ids: liked.map((i) => i.id) };
}

export function isLiked(p: Profile, id: string): boolean {
  return p.liked_ids.includes(id);
}

/** Toggle a save. Idempotent. `snapshot` only used when adding. */
export function toggleSave(p: Profile, id: string, snapshot: Omit<LibraryItem, "ts">): Profile {
  const saved = toggleInList(p.saved, id, snapshot);
  return { ...p, saved };
}

export function isSaved(p: Profile, id: string): boolean {
  return p.saved.some((s) => s.id === id);
}

/** Total items in the user's library (saved + liked, deduped by id). */
export function libraryCount(p: Profile): number {
  const ids = new Set<string>();
  for (const i of p.saved) ids.add(i.id);
  for (const i of p.liked) ids.add(i.id);
  return ids.size;
}
