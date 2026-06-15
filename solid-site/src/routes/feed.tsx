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
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";

import { Card } from "~/components/Card";
import { CardSkeleton } from "~/components/Skeleton";
import { fetchCard, type CardContent } from "~/lib/graphql";
import { resolveImage } from "~/lib/image";
import * as pool from "~/lib/pool";
import {
  isLiked,
  isOnboarded,
  isSaved,
  load,
  markSeen,
  save,
  toggleLike,
  toggleSave,
  type LibraryItem,
  type Profile,
} from "~/lib/profile";

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

  // Pool lives as a plain ref because we mutate it imperatively around
  // the per-tap fetch dance.
  let poolState: pool.PoolState = pool.createPool(profile().langs[0] || "ENGLISH");

  const updateProfile = (next: Profile) => {
    setProfile(next);
    save(next);
  };

  /** Pop ids until we get one whose GraphQL fetch returns content. */
  async function nextValidContent(): Promise<CardContent | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (pool.shouldRefill(poolState)) {
        poolState = await pool.refill(poolState, profile());
      }
      const { id, rest } = pool.pop(poolState);
      poolState = rest;
      if (!id) return null;
      const lang = profile().langs[0] || "ENGLISH";
      const content = await fetchCard(id, lang);
      if (content) {
        updateProfile(markSeen(profile(), String(content.id)));
        return content;
      }
      // GraphQL failed for this id (deleted, lang mismatch). Skip.
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
      poolState = await pool.refill(poolState, profile());
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
    if (!s.next) {
      // No pre-fetched next; fall back to a synchronous fetch.
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
    // Promote next → current and pre-fetch the new next.
    const promoted = s.next;
    setState({ kind: "ready", current: promoted, next: null });
    const after = await nextValidContent();
    setState((current) =>
      current.kind === "ready" ? { ...current, next: after } : current,
    );
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
            <Card
              content={s.current}
              onNext={handleNext}
              hasNext={true}
              liked={isLiked(profile(), String(s.current.id))}
              saved={isSaved(profile(), String(s.current.id))}
              onToggleLike={() => onToggleLike(s.current)}
              onToggleSave={() => onToggleSave(s.current)}
            />
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
