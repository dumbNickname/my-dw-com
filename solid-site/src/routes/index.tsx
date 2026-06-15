/**
 * Onboarding screen — pick interests, then start.
 *
 * Structure:
 *   1. Languages: popular 8 by default + "Show more" expander for the
 *      rest. On first visit we pre-select the browser's preferred
 *      DW-supported language (falling back to ENGLISH).
 *   2. Categories: 20 chips from src/data/categories.json.
 *   3. Regions: 6 chips from src/data/regions.json.
 *   4. Trending carousel: ~10 cards, fanned out across the user's
 *      selected languages (top 3) and interleaved round-robin so each
 *      language is represented (FW4). Refetches when the SET of
 *      selected languages changes; chip-reorders that just bump
 *      langs[0] do not re-fetch.
 *   5. Mandatory: ≥1 chip OR ≥1 carousel tap. Then "Start reading" → /feed.
 *
 * Selections write to localStorage profile and the feed picks up from there.
 */
import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";

import { CarouselCard, carouselStyles } from "~/components/CarouselCard";
import { CarouselSkeleton } from "~/components/Skeleton";
import categoriesData from "~/data/categories.json";
import regionsData from "~/data/regions.json";
import { fetchCard, type CardContent } from "~/lib/graphql";
import {
  detectBrowserLang,
  byEnum,
  OTHER_LANGUAGES,
  POPULAR_LANGUAGES,
} from "~/lib/lang";
import * as peach from "~/lib/peach";
import { isOnboarded, load, save, type Profile } from "~/lib/profile";

import styles from "./index.module.css";

const TRENDING_AMOUNT = 10;
const TRENDING_PER_LANG = 5;     // fetch this many ids per selected language
const TRENDING_LANG_FANOUT = 3;  // cap on number of languages we query
const FETCH_PARALLEL = 6;

type Item = { id: string; name: string };

const CATEGORIES = categoriesData as Item[];
const REGIONS = regionsData as Item[];

/**
 * Interleave several arrays round-robin so each input is represented
 * proportionally in the output. ["a1","a2"], ["b1","b2"], ["c1"] →
 * ["a1","b1","c1","a2","b2"]. Used to mix per-language trending lists.
 */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = lists.reduce((n, l) => Math.max(n, l.length), 0);
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

/**
 * Load a multi-language trending carousel.
 *
 * For each selected language (capped at TRENDING_LANG_FANOUT), pull
 * TRENDING_PER_LANG candidates from `/v2/most-viewed`, dedup by id,
 * interleave round-robin so the user sees the languages mixed rather
 * than blocked. Each card is then GraphQL-fetched in its own language.
 */
async function loadTrendingCards(langs: string[]): Promise<CardContent[]> {
  const selected = langs.slice(0, TRENDING_LANG_FANOUT);
  if (selected.length === 0) return [];

  const perLang = await Promise.all(
    selected.map((l) => peach.mostViewed({ lang: l, amount: TRENDING_PER_LANG })),
  );

  // Interleave then dedupe (keep first occurrence). Cap at TRENDING_AMOUNT.
  const interleaved = interleave(perLang);
  const seen = new Set<string>();
  const candidates: { id: string; lang: string }[] = [];
  for (const c of interleaved) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    candidates.push(c);
    if (candidates.length >= TRENDING_AMOUNT) break;
  }
  if (candidates.length === 0) return [];

  // Fetch in small parallel batches so we do not block the first paint
  // behind a single slow request. Each card is fetched in its own
  // language so the GraphQL miss-rate stays low.
  const out: CardContent[] = [];
  for (let i = 0; i < candidates.length; i += FETCH_PARALLEL) {
    const slice = candidates.slice(i, i + FETCH_PARALLEL);
    const settled = await Promise.allSettled(
      slice.map((c) => fetchCard(c.id, c.lang)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) out.push(r.value);
    }
  }
  return out;
}

/**
 * Apply browser-language autodetection on a freshly-loaded profile.
 * Only runs when the user hasn't touched anything yet (no categories,
 * regions, seed_ids, likes, or saves). Returns the profile unchanged
 * if the user has already onboarded or already has non-default langs.
 */
function withAutodetectedLang(p: Profile): Profile {
  const usingDefault = p.langs.length === 1 && p.langs[0] === "ENGLISH";
  const untouched =
    p.categories.length === 0 &&
    p.regions.length === 0 &&
    p.seed_ids.length === 0 &&
    p.liked.length === 0 &&
    p.saved.length === 0;
  if (!usingDefault || !untouched) return p;
  const detected = detectBrowserLang();
  if (!detected || detected === "ENGLISH") return p;
  // Prepend the detected language so it becomes langs[0] (the one used
  // by trending / similar / most-viewed). Keep ENGLISH as a fallback.
  return { ...p, langs: [detected, "ENGLISH"] };
}

export default function Onboarding() {
  const navigate = useNavigate();

  const [profile, setProfile] = createSignal<Profile>(withAutodetectedLang(load()));
  const [trending, setTrending] = createSignal<CardContent[]>([]);
  const [trendingLoading, setTrendingLoading] = createSignal(true);
  const [trendingError, setTrendingError] = createSignal(false);
  const [showAllLangs, setShowAllLangs] = createSignal(false);

  // If the user already onboarded, redirect to /feed immediately.
  onMount(() => {
    if (isOnboarded(profile())) {
      navigate("/feed", { replace: true });
      return;
    }
  });

  // Re-load the trending carousel whenever the SET of selected
  // languages changes (capped at TRENDING_LANG_FANOUT). Pure re-orders
  // are ignored to avoid a fetch on every chip tap that just re-shuffles
  // langs[0].
  createEffect(
    on(
      () => {
        const cap = profile().langs.slice(0, 3);
        return [...cap].sort().join(",");
      },
      () => {
        setTrendingLoading(true);
        setTrendingError(false);
        loadTrendingCards(profile().langs)
          .then((cards) => {
            setTrending(cards);
            setTrendingError(cards.length === 0);
          })
          .catch(() => setTrendingError(true))
          .finally(() => setTrendingLoading(false));
      },
    ),
  );

  // Persist on every change. Cheap.
  createEffect(on(profile, (p) => save(p)));

  /**
   * Toggle a language. Always keep at least one selected. The most
   * recently added language becomes langs[0] (drives `similar`,
   * `trending_tz`, etc. as the "primary" lang). The carousel re-fetches
   * only when the SET of selected languages changes; pure reorders are
   * a no-op for the carousel.
   */
  const toggleLang = (e: string) => {
    setProfile((p) => {
      const has = p.langs.includes(e);
      if (has) {
        if (p.langs.length <= 1) return p; // never empty
        return { ...p, langs: p.langs.filter((l) => l !== e) };
      }
      return { ...p, langs: [e, ...p.langs.filter((l) => l !== e)] };
    });
  };

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

  // Any non-popular language picked by the user should be visible by
  // default in the expander, so they can see the selection without
  // clicking "Show more".
  const hasSelectedHiddenLang = () =>
    profile().langs.some((e) => {
      const lang = byEnum(e);
      return lang && !lang.popular;
    });

  const showMore = () => showAllLangs() || hasSelectedHiddenLang();

  return (
    <div class="shell">
      <Title>my.dw.com — pick what to read</Title>

      <header class={styles.intro}>
        <h1>Tell us what to read.</h1>
        <p>
          Pick a few topics, regions, or stories that look interesting. We use
          this only on this device, no account required.
        </p>
      </header>

      <section class="section-block">
        <h2 class="section-title">Languages</h2>
        <div class={styles["chip-row"]}>
          <For each={POPULAR_LANGUAGES}>
            {(l) => (
              <button
                type="button"
                class={styles.chip}
                data-selected={profile().langs.includes(l.enum)}
                aria-pressed={profile().langs.includes(l.enum)}
                onClick={() => toggleLang(l.enum)}
                title={l.english}
              >
                {l.native}
              </button>
            )}
          </For>
          <Show when={showMore()}>
            <For each={OTHER_LANGUAGES}>
              {(l) => (
                <button
                  type="button"
                  class={styles.chip}
                  data-selected={profile().langs.includes(l.enum)}
                  aria-pressed={profile().langs.includes(l.enum)}
                  onClick={() => toggleLang(l.enum)}
                  title={l.english}
                >
                  {l.native}
                </button>
              )}
            </For>
          </Show>
          <button
            type="button"
            class={styles["chip-ghost"]}
            onClick={() => setShowAllLangs((x) => !x)}
            aria-expanded={showMore()}
          >
            {showAllLangs() ? "Show less" : `Show ${OTHER_LANGUAGES.length} more`}
          </button>
        </div>
      </section>

      <section class="section-block">
        <h2 class="section-title">Topics</h2>
        <div class={styles["chip-row"]}>
          <For each={CATEGORIES}>
            {(c) => (
              <button
                type="button"
                class={styles.chip}
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
        <div class={styles["chip-row"]}>
          <For each={REGIONS}>
            {(r) => (
              <button
                type="button"
                class={styles.chip}
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
            <div class={carouselStyles.carousel}>
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

      <div class={styles["start-row"]}>
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
