/**
 * Onboarding screen — pick interests, then start.
 *
 * Structure (per PRD M1 / Round 2 Q2.1):
 *   1. Categories: 20 chips from src/data/categories.json.
 *   2. Regions: 10 chips from src/data/regions.json.
 *   3. Trending carousel: ~10 cards from /v2/most-viewed via per-id GraphQL.
 *   4. Mandatory: ≥1 chip OR ≥1 carousel tap. Then "Start reading" → /feed.
 *
 * Selections write to localStorage profile and the feed picks up from there.
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";

import { CarouselCard } from "~/components/CarouselCard";
import { CarouselSkeleton } from "~/components/Skeleton";
import categoriesData from "~/data/categories.json";
import regionsData from "~/data/regions.json";
import { fetchCard, type CardContent } from "~/lib/graphql";
import * as peach from "~/lib/peach";
import { isOnboarded, load, save, type Profile } from "~/lib/profile";

const TRENDING_AMOUNT = 10;
const FETCH_PARALLEL = 6;

type Item = { id: string; name: string };

const CATEGORIES = categoriesData as Item[];
const REGIONS = regionsData as Item[];

async function loadTrendingCards(lang: string): Promise<CardContent[]> {
  const ids = await peach.mostViewed(lang, TRENDING_AMOUNT);
  if (ids.length === 0) return [];
  // Fetch in small parallel batches so we do not block the first paint
  // behind a single slow request.
  const out: CardContent[] = [];
  for (let i = 0; i < ids.length; i += FETCH_PARALLEL) {
    const slice = ids.slice(i, i + FETCH_PARALLEL);
    const settled = await Promise.allSettled(slice.map((id) => fetchCard(id, lang)));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) out.push(r.value);
    }
  }
  return out;
}

export default function Onboarding() {
  const navigate = useNavigate();

  const [profile, setProfile] = createSignal<Profile>(load());
  const [trending, setTrending] = createSignal<CardContent[]>([]);
  const [trendingLoading, setTrendingLoading] = createSignal(true);
  const [trendingError, setTrendingError] = createSignal(false);

  // If the user already onboarded, redirect to /feed immediately.
  onMount(() => {
    if (isOnboarded(profile())) {
      navigate("/feed", { replace: true });
      return;
    }
    setTrendingLoading(true);
    setTrendingError(false);
    loadTrendingCards(profile().langs[0] || "ENGLISH")
      .then((cards) => {
        setTrending(cards);
        setTrendingError(cards.length === 0);
      })
      .catch(() => setTrendingError(true))
      .finally(() => setTrendingLoading(false));
  });

  // Persist on every change. Cheap.
  createEffect(on(profile, (p) => save(p)));

  const toggleCategory = (id: string) => {
    setProfile((p) => ({
      ...p,
      categories: p.categories.includes(id)
        ? p.categories.filter((x) => x !== id)
        : [...p.categories, id],
    }));
  };

  const toggleRegion = (id: string) => {
    setProfile((p) => ({
      ...p,
      regions: p.regions.includes(id)
        ? p.regions.filter((x) => x !== id)
        : [...p.regions, id],
    }));
  };

  const toggleSeed = (id: string) => {
    setProfile((p) => ({
      ...p,
      seed_ids: p.seed_ids.includes(id)
        ? p.seed_ids.filter((x) => x !== id)
        : [...p.seed_ids, id],
    }));
  };

  const canStart = () =>
    profile().categories.length > 0 ||
    profile().regions.length > 0 ||
    profile().seed_ids.length > 0;

  const handleStart = () => {
    if (!canStart()) return;
    navigate("/feed");
  };

  return (
    <div class="shell">
      <Title>my.dw.com — pick what to read</Title>

      <header style={{ "margin-bottom": "8px" }}>
        <h1
          style={{
            "font-size": "clamp(28px, 5vw, 36px)",
            "font-weight": 700,
            "letter-spacing": "-0.02em",
            "line-height": 1.15,
            margin: "0 0 8px",
          }}
        >
          Tell us what to read.
        </h1>
        <p
          style={{
            color: "var(--c-text-mute)",
            "font-size": "16px",
            "max-width": "55ch",
            margin: 0,
          }}
        >
          Pick a few topics, regions, or stories that look interesting. We use
          this only on this device, no account required.
        </p>
      </header>

      <section class="section-block">
        <h2 class="section-title">Topics</h2>
        <div class="chip-row">
          <For each={CATEGORIES}>
            {(c) => (
              <button
                type="button"
                class="chip"
                data-selected={profile().categories.includes(c.id)}
                aria-pressed={profile().categories.includes(c.id)}
                onClick={() => toggleCategory(c.id)}
              >
                {c.name}
              </button>
            )}
          </For>
        </div>
      </section>

      <section class="section-block">
        <h2 class="section-title">Regions</h2>
        <div class="chip-row">
          <For each={REGIONS}>
            {(r) => (
              <button
                type="button"
                class="chip"
                data-selected={profile().regions.includes(r.id)}
                aria-pressed={profile().regions.includes(r.id)}
                onClick={() => toggleRegion(r.id)}
              >
                {r.name}
              </button>
            )}
          </For>
        </div>
      </section>

      <section class="section-block">
        <h2 class="section-title">Trending right now — tap any that look interesting</h2>
        <Show
          when={!trendingLoading()}
          fallback={<CarouselSkeleton />}
        >
          <Show
            when={trending().length > 0}
            fallback={
              <div class="notice">
                <Show
                  when={trendingError()}
                  fallback={<>No trending content available right now.</>}
                >
                  <strong>Could not load trending stories.</strong>
                  <br />
                  Pick a topic or region above to get started.
                </Show>
              </div>
            }
          >
            <div class="carousel">
              <For each={trending()}>
                {(c) => (
                  <CarouselCard
                    content={c}
                    selected={profile().seed_ids.includes(String(c.id))}
                    onToggle={() => toggleSeed(String(c.id))}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </section>

      <div
        style={{
          display: "flex",
          "justify-content": "flex-end",
          gap: "12px",
          padding: "8px 0 16px",
        }}
      >
        <button
          type="button"
          class="btn btn-primary"
          onClick={handleStart}
          disabled={!canStart()}
          aria-label="Start reading"
        >
          Start reading
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 3l5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
