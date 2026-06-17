/**
 * Feed — the reels-style loop.
 *
 * One full-screen card at a time. "Next" advances. Pre-fetches the next
 * card while the current is on screen so taps feel instant. Falls back
 * gracefully when the pool runs dry.
 *
 * Action bar (M2 first slice): like + save persist to profile; expand
 * lazy-fetches the body. The library sheet (saved + liked tabs) is
 * owned by `Shell` and opened via the LibraryContext — feed only
 * triggers it.
 *
 * Recommendation freshness (FW4 + FW4b):
 *   - The pool carries `{id, lang}` candidates so multi-language users
 *     see content from every selected language (`lib/pool.ts` handles
 *     the fan-out).
 *   - Every rendered card is pushed to `profile.recent_view_ids` (FIFO
 *     20). This window is the implicit-interest signal that drives
 *     the periodic re-mine — the feed adapts mid-session even if the
 *     user never taps Like.
 *   - Every RE_MINE_EVERY taps we trigger a refill with
 *     `seedFromRecent`, so the pool gets new `peach.similar` matches
 *     keyed to what the user has actually been reading.
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";

import { Card } from "~/components/Card";
import { CardSkeleton } from "~/components/Skeleton";
import { SwipeContainer, type SwipeDirection } from "~/components/SwipeContainer";
import { fetchCard, type CardContent } from "~/lib/graphql";
import { resolveImage } from "~/lib/image";
import * as peach from "~/lib/peach";
import * as pool from "~/lib/pool";
import {
  addInteresting,
  isLiked,
  isOnboarded,
  isSaved,
  load,
  markSeen,
  markViewed,
  save,
  toggleLike,
  toggleSave,
  type LibraryItem,
  type Profile,
} from "~/lib/profile";

const RE_MINE_EVERY = 5; // tap interval at which we seed a refill from recent_view_ids

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; current: CardContent; next: CardContent | null }
  | { kind: "empty" }
  | { kind: "error"; message: string };

const snapshot = (c: CardContent, fallbackLang: string): Omit<LibraryItem, "ts"> => ({
  id: String(c.id),
  lang: c.language || fallbackLang,
  title: c.title || "(untitled)",
  kicker: c.roadTeaserKicker,
  // Resolve the staticUrl now so the library sheet can render the thumb
  // without re-implementing the format ladder. We pick the 80X group
  // (square) because the sheet shows a 64px square; 802 (≈352px wide) is
  // the smallest entry that still looks crisp on hi-DPI screens.
  image: resolveImage(c.mainContentImage?.staticUrl, "80X", 80) ?? null,
  namedUrl: c.namedUrl,
});

export default function Feed() {
  const navigate = useNavigate();

  const [state, setState] = createSignal<FeedState>({ kind: "loading" });

  // Profile is reactive so the action bar reflects toggle state immediately
  // without us threading it through the FeedState union.
  const [profile, setProfile] = createSignal<Profile>(load());

  // Pool + tap counter live as plain refs because we mutate them
  // imperatively around the per-tap fetch dance.
  let poolState: pool.PoolState = pool.createPool();
  let tapCount = 0;

  const updateProfile = (next: Profile) => {
    setProfile(next);
    save(next);
  };

  /**
   * Mark a freshly-shown card in the profile's seen + recent-view
   * tracking. `seen_ids` is the permanent dedup set; `recent_view_ids`
   * is the rolling re-mine signal. Both are bumped together on every
   * card the user actually renders.
   */
  const markRendered = (id: string) => {
    let next = markSeen(profile(), id);
    next = markViewed(next, id);
    updateProfile(next);
  };

  /**
   * Decide whether this refill should be a "re-mine" (passes recent
   * views as additional `peach.similar` seeds). We re-mine every Nth
   * tap once the user has built up a recent-view window worth seeding
   * from.
   */
  const refillOpts = (): pool.RefillOpts => {
    const recent = profile().recent_view_ids;
    if (recent.length === 0) return {};
    if (tapCount > 0 && tapCount % RE_MINE_EVERY === 0) {
      return { seedFromRecent: recent };
    }
    return {};
  };

  /** Pop candidates until we get one whose GraphQL fetch returns content. */
  async function nextValidContent(): Promise<CardContent | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (pool.shouldRefill(poolState)) {
        poolState = await pool.refill(poolState, profile(), refillOpts());
      }
      const { candidate, rest } = pool.pop(poolState);
      poolState = rest;
      if (!candidate) return null;
      // Fetch in the candidate's own language; the pool guarantees
      // that's one of the user's selected languages.
      const content = await fetchCard(candidate.id, candidate.lang);
      if (content) {
        markRendered(String(content.id));
        return content;
      }
      // GraphQL miss for this id (deleted, lang mismatch, etc.). Skip.
    }
    return null;
  }

  async function init() {
    if (!isOnboarded(profile())) {
      navigate("/", { replace: true });
      return;
    }
    setState({ kind: "loading" });
    try {
      poolState = await pool.refill(poolState, profile(), {});
      const current = await nextValidContent();
      if (!current) {
        setState({ kind: "empty" });
        return;
      }
      // Pre-fetch the next one in the background; not fatal if it fails.
      const nextPromise = nextValidContent();
      setState({ kind: "ready", current, next: null });
      nextPromise
        .then((next) => {
          setState((s) => (s.kind === "ready" ? { ...s, next } : s));
        })
        .catch(() => {
          /* leave next as null */
        });
    } catch (e) {
      console.error("[feed] init failed", e);
      setState({ kind: "error", message: "Something went wrong loading your feed." });
    }
  }

  async function handleNext() {
    const s = state();
    if (s.kind !== "ready") return;
    tapCount += 1;
    if (!s.next) {
      setState({ kind: "loading" });
      const fresh = await nextValidContent();
      if (!fresh) {
        setState({ kind: "empty" });
        return;
      }
      const after = await nextValidContent();
      setState({ kind: "ready", current: fresh, next: after });
      return;
    }
    const promoted = s.next;
    setState({ kind: "ready", current: promoted, next: null });
    const after = await nextValidContent();
    setState((current) =>
      current.kind === "ready" ? { ...current, next: after } : current,
    );
  }

  function handleSwipe(dir: SwipeDirection) {
    const s = state();
    if (s.kind !== "ready") return;
    if (dir === "interesting") {
      const c = s.current;
      updateProfile(addInteresting(profile(), String(c.id), c.language || profile().langs[0] || "ENGLISH"));
    }
    void handleNext();
  }

  async function handleNextSimilar() {
    const s = state();
    if (s.kind !== "ready") return;
    const c = s.current;
    const lang = c.language || profile().langs[0] || "ENGLISH";

    updateProfile(addInteresting(profile(), String(c.id), lang));

    const candidates = await peach.similar(String(c.id), lang, 12);
    const seen = new Set(profile().seen_ids);
    const inQueue = new Set(poolState.queue.map((x) => x.id));
    const unseen = candidates.filter((x) => !seen.has(x.id) && !inQueue.has(x.id) && x.lang === lang);
    const priority = unseen.slice(0, 3);
    const rest = unseen.slice(3);

    if (priority.length > 0 || rest.length > 0) {
      poolState = { ...poolState, queue: [...priority, ...poolState.queue, ...rest] };
      setState((prev) => prev.kind === "ready" ? { ...prev, next: null } : prev);
    }
    void handleNext();
  }

  const onToggleLike = (c: CardContent) => {
    const fallbackLang = profile().langs[0] || "ENGLISH";
    updateProfile(toggleLike(profile(), String(c.id), snapshot(c, fallbackLang)));
  };

  const onToggleSave = (c: CardContent) => {
    const fallbackLang = profile().langs[0] || "ENGLISH";
    updateProfile(toggleSave(profile(), String(c.id), snapshot(c, fallbackLang)));
  };

  onMount(() => {
    void init();
  });

  let expandFn: (() => void) | undefined;

  return (
    <div class="shell">
      <Title>my.dw.com — feed</Title>
      <Show when={state().kind === "loading"}>
        <CardSkeleton />
      </Show>
      <Show when={state().kind === "ready"}>
        {(() => {
          const s = state() as Extract<FeedState, { kind: "ready" }>;
          return (
            <SwipeContainer onSwipe={handleSwipe} onToggleExpand={() => expandFn?.()}>
              <Card
                content={s.current}
                liked={isLiked(profile(), String(s.current.id))}
                saved={isSaved(profile(), String(s.current.id))}
                onToggleLike={() => onToggleLike(s.current)}
                onToggleSave={() => onToggleSave(s.current)}
                onNextSimilar={handleNextSimilar}
                expandRef={(fn) => { expandFn = fn; }}
              />
            </SwipeContainer>
          );
        })()}
      </Show>
      <Show when={state().kind === "empty"}>
        <div class="notice">
          <strong>You've seen everything we have for now.</strong>
          <br />
          Try adding more topics or come back later.
          <div style={{ "margin-top": "16px" }}>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => navigate("/")}
            >
              Edit interests
            </button>
          </div>
        </div>
      </Show>
      <Show when={state().kind === "error"}>
        {(() => {
          const s = state() as Extract<FeedState, { kind: "error" }>;
          return (
            <div class="notice">
              <strong>{s.message}</strong>
              <br />
              Check your network and try again.
              <div style={{ "margin-top": "16px" }}>
                <button
                  type="button"
                  class="btn btn-ghost"
                  onClick={() => init()}
                >
                  Retry
                </button>
              </div>
            </div>
          );
        })()}
      </Show>
    </div>
  );
}
