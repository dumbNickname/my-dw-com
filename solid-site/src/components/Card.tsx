/**
 * Feed card — the single full-screen content the user reads on tap.
 *
 * Shows: image, kicker, title, summary, language badge, relative date.
 *
 * Bottom action bar:
 *   ♥ Like        toggles, persists to profile.liked_ids
 *   🔖 Save       toggles, persists to profile.saved (snapshot stored)
 *   ⤢ Expand      lazy-fetches body via MyDwBody, renders as plain
 *                 paragraphs (no DOMPurify until M3)
 *   Open ↗        external link to dw.com
 *
 * Navigation (Next / Interesting) is handled by the parent
 * SwipeContainer via gestures (mobile) or side buttons (desktop).
 *
 * "Next similar" button renders at the end of the expanded body text.
 */
import { Show, Switch, Match, createSignal, For, onMount, onCleanup } from "solid-js";

import type { CardContent } from "~/lib/graphql";
import { fetchBody } from "~/lib/graphql";
import { htmlToBlocks, type BodyBlock } from "~/lib/htmlText";
import { resolveImage } from "~/lib/image";

import styles from "./Card.module.css";

const formatRelative = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const m = Math.round(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
};

const buildDwLink = (content: CardContent): string => {
  if (content.namedUrl) return `https://www.dw.com${content.namedUrl}`;
  const langSlug = (content.language || "ENGLISH").toLowerCase().slice(0, 2);
  return `https://www.dw.com/${langSlug}/a-${content.id}`;
};

const langShort = (lang: string | null | undefined): string =>
  (lang || "EN").toUpperCase().slice(0, 2);

const summaryText = (c: CardContent): string => c.shortTeaser || c.teaser || "";

function HlsVideo(props: { src: string; poster?: string }) {
  let videoRef: HTMLVideoElement | undefined;
  let hlsInstance: any;

  onMount(() => {
    if (!videoRef) return;
    if (videoRef.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.src = props.src;
      return;
    }
    import("hls.js").then((mod) => {
      const Hls = mod.default;
      if (!Hls.isSupported() || !videoRef) return;
      const hls = new Hls();
      hls.loadSource(props.src);
      hls.attachMedia(videoRef);
      hlsInstance = hls;
    }).catch(() => {
      if (videoRef) videoRef.src = props.src;
    });
  });

  onCleanup(() => {
    if (hlsInstance) hlsInstance.destroy();
  });

  return (
    <video
      ref={videoRef}
      class={styles["feed-card-video"]}
      controls
      playsinline
      preload="metadata"
      poster={props.poster}
    />
  );
}

export type CardProps = {
  content: CardContent;
  liked: boolean;
  saved: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onNextSimilar?: () => void;
};

export function Card(props: CardProps) {
  const img = () => resolveImage(props.content.mainContentImage?.staticUrl, "60X", 720);
  const dwLink = () => buildDwLink(props.content);

  const [expanded, setExpanded] = createSignal(false);
  const [bodyBlocks, setBodyBlocks] = createSignal<BodyBlock[] | null>(null);
  const [bodyLoading, setBodyLoading] = createSignal(false);
  const [bodyError, setBodyError] = createSignal(false);

  async function handleExpand() {
    if (expanded()) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (bodyBlocks() !== null) return;
    setBodyLoading(true);
    setBodyError(false);
    try {
      const html = await fetchBody(props.content.id, props.content.language);
      const blocks = htmlToBlocks(html);
      setBodyBlocks(blocks);
      if (blocks.length === 0) setBodyError(true);
    } catch {
      setBodyError(true);
    } finally {
      setBodyLoading(false);
    }
  }

  const isVideo = () => props.content.modelType === "VIDEO" && !!props.content.hlsVideoSrc;
  const isAudio = () => props.content.modelType === "AUDIO" && !!props.content.mp3Src;

  return (
    <article class={styles["feed-card"]} aria-label={props.content.title || "Article"}>
      <Switch>
        <Match when={isVideo()}>
          <HlsVideo src={props.content.hlsVideoSrc!} poster={img()} />
        </Match>
        <Match when={isAudio()}>
          <Show when={img()}>
            <img
              class={styles["feed-card-img"]}
              src={img()}
              alt=""
              loading="eager"
              decoding="async"
              fetchpriority="high"
            />
          </Show>
          <audio
            class={styles["feed-card-audio"]}
            controls
            preload="metadata"
            src={props.content.mp3Src!}
          />
        </Match>
        <Match when={img()}>
          <img
            class={styles["feed-card-img"]}
            src={img()}
            alt=""
            loading="eager"
            decoding="async"
            fetchpriority="high"
          />
        </Match>
      </Switch>

      <div class={styles["feed-card-body"]}>
        <div class={styles["feed-card-meta"]}>
          <Show when={props.content.roadTeaserKicker}>
            <span class={styles["feed-card-kicker"]}>{props.content.roadTeaserKicker}</span>
          </Show>
          <span class={styles["feed-card-lang"]} title={props.content.language || ""}>
            {langShort(props.content.language)}
          </span>
          <Show when={props.content.contentDate}>
            <span>{formatRelative(props.content.contentDate)}</span>
          </Show>
          <Show when={props.content.formattedDurationInMinutes}>
            <span>· {props.content.formattedDurationInMinutes} min</span>
          </Show>
        </div>

        <h1 class={styles["feed-card-title"]}>{props.content.title}</h1>

        <Show when={summaryText(props.content)}>
          <p class={styles["feed-card-summary"]}>{summaryText(props.content)}</p>
        </Show>

        <Show when={expanded()}>
          <div class={styles["feed-card-body-text"]} aria-live="polite">
            <Show when={bodyLoading()}>
              <p class={styles["feed-card-body-status"]}>Loading…</p>
            </Show>
            <Show when={!bodyLoading() && bodyError()}>
              <p class={styles["feed-card-body-status"]}>
                Couldn't load the full article.{" "}
                <a class="canon-link" href={dwLink()} target="_blank" rel="noopener noreferrer">
                  Open on dw.com ↗
                </a>
              </p>
            </Show>
            <Show when={!bodyLoading() && bodyBlocks() && bodyBlocks()!.length > 0}>
              <For each={bodyBlocks()!}>
                {(block) => (
                  <Show when={block.kind === "text"} fallback={
                    <img
                      class={styles["body-img"]}
                      src={(block as Extract<BodyBlock, { kind: "image" }>).src}
                      alt={(block as Extract<BodyBlock, { kind: "image" }>).alt}
                      loading="lazy"
                      decoding="async"
                    />
                  }>
                    <p>{(block as Extract<BodyBlock, { kind: "text" }>).content}</p>
                  </Show>
                )}
              </For>
              <Show when={props.onNextSimilar}>
                <button
                  type="button"
                  class={styles["next-similar-btn"]}
                  onClick={() => props.onNextSimilar?.()}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 2l1.5 4.5H14l-3.5 2.8L12 14 8 11l-4 3 1.5-4.7L2 6.5h4.5z" />
                  </svg>
                  Next similar
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 3l5 5-5 5" />
                  </svg>
                </button>
              </Show>
            </Show>
          </div>
        </Show>
      </div>

      <nav class={styles["action-bar"]} aria-label="Article actions">
        <button
          type="button"
          class={styles["action-btn"]}
          data-active={props.liked}
          onClick={() => props.onToggleLike()}
          aria-pressed={props.liked}
          aria-label={props.liked ? "Unlike article" : "Like article"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill={props.liked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5 5.5 5c2 0 3.5 1.2 4.5 2.5C11 6.2 12.5 5 14.5 5 18 5 19.5 9 17.5 12.5 15 16.65 12 21 12 21z" />
          </svg>
          <span class={styles["action-label"]}>{props.liked ? "Liked" : "Like"}</span>
        </button>

        <button
          type="button"
          class={styles["action-btn"]}
          data-active={props.saved}
          onClick={() => props.onToggleSave()}
          aria-pressed={props.saved}
          aria-label={props.saved ? "Remove from saved" : "Save article"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill={props.saved ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path d="M6 4h12v17l-6-4-6 4z" />
          </svg>
          <span class={styles["action-label"]}>{props.saved ? "Saved" : "Save"}</span>
        </button>

        <button
          type="button"
          class={styles["action-btn"]}
          data-active={expanded()}
          onClick={() => void handleExpand()}
          aria-expanded={expanded()}
          aria-label={expanded() ? "Collapse article" : "Expand article"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <Show when={!expanded()} fallback={<path d="M6 15l6-6 6 6" />}>
              <path d="M6 9l6 6 6-6" />
            </Show>
          </svg>
          <span class={styles["action-label"]}>{expanded() ? "Less" : "Read"}</span>
        </button>

        <a
          class={`${styles["action-btn"]} ${styles["action-btn-link"]}`}
          href={dwLink()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original on dw.com"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
          </svg>
          <span class={styles["action-label"]}>dw.com</span>
        </a>
      </nav>
    </article>
  );
}
