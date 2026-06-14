/**
 * Feed — the reels-style loop.
 *
 * One full-screen card at a time. "Next" advances. Pre-fetches the next
 * card while the current is on screen so taps feel instant. Falls back
 * gracefully when the pool runs dry.
 *
 * No likes / saves / streak / detail-view in M1 — those land in M2.
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";

import { Card } from "~/components/Card";
import { CardSkeleton } from "~/components/Skeleton";
import { fetchCard, type CardContent } from "~/lib/graphql";
import * as pool from "~/lib/pool";
import { isOnboarded, load, markSeen, save, type Profile } from "~/lib/profile";

type FeedState =
  | { kind: "loading" }
  | { kind: "ready"; current: CardContent; next: CardContent | null }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export default function Feed() {
  const navigate = useNavigate();

  const [state, setState] = createSignal<FeedState>({ kind: "loading" });

  // Profile + pool live as plain refs because we mutate them imperatively
  // around the per-tap fetch dance.
  let profile: Profile = load();
  let poolState: pool.PoolState = pool.createPool(profile.langs[0] || "ENGLISH");

  const persist = () => save(profile);

  /** Pop ids until we get one whose GraphQL fetch returns content. */
  async function nextValidContent(): Promise<CardContent | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (pool.shouldRefill(poolState)) {
        poolState = await pool.refill(poolState, profile);
      }
      const { id, rest } = pool.pop(poolState);
      poolState = rest;
      if (!id) return null;
      const lang = profile.langs[0] || "ENGLISH";
      const content = await fetchCard(id, lang);
      if (content) {
        profile = markSeen(profile, String(content.id));
        persist();
        return content;
      }
      // GraphQL failed for this id (deleted, lang mismatch). Skip.
    }
    return null;
  }

  async function init() {
    if (!isOnboarded(profile)) {
      navigate("/", { replace: true });
      return;
    }
    setState({ kind: "loading" });
    try {
      poolState = await pool.refill(poolState, profile);
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
