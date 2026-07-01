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
import { Show, Switch, Match, createSignal, createResource, createEffect, For, onMount, onCleanup } from "solid-js";

import type { CardContent } from "~/lib/graphql";
import { fetchBody, fetchWidget } from "~/lib/graphql";
import { htmlToBlocks, type BodyBlock, type TextSegment } from "~/lib/htmlText";
import { resolveImage } from "~/lib/image";
import { byCode } from "~/lib/lang";
import { speechSupported, bcp47ForLang, getVoicesAsync, pickVoice } from "~/lib/speech";

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

function blocksToText(blocks: BodyBlock[]): string {
  return blocks
    .filter((b): b is Extract<BodyBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.segments.map((s) => s.text).join(""))
    .join("\n\n");
}

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
      disablepictureinpicture
      preload="metadata"
      poster={props.poster}
    />
  );
}

const ALLOWED_IFRAME_HOSTS = ["datawrapper.dwcdn.net", "flo.uri.sh", "app.flourish.studio"];
const IFRAME_SRC_RE = /src="([^"]+)"/;

function extractIframeSrc(embedCode: string): string | null {
  const m = IFRAME_SRC_RE.exec(embedCode);
  if (!m) return null;
  try {
    const url = new URL(m[1]);
    if (ALLOWED_IFRAME_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) return m[1];
  } catch { /* invalid URL */ }
  return null;
}

const IFRAME_HEIGHT_RE = /height="(\d+)"/;

function extractIframeHeight(embedCode: string): number {
  const m = IFRAME_HEIGHT_RE.exec(embedCode);
  return m ? Number(m[1]) : 400;
}

function WidgetEmbed(props: { id: number; lang: string }) {
  const langEnum = () => {
    const code = props.lang.toLowerCase();
    return byCode(code)?.enum ?? props.lang.toUpperCase();
  };

  const [data] = createResource(() => ({ id: props.id, lang: langEnum() }), (p) => fetchWidget(p.id, p.lang));

  const iframeSrc = () => {
    const d = data();
    if (!d?.embedCode) return null;
    if (d.widgetType !== "GRAPHIC") return null;
    return extractIframeSrc(d.embedCode);
  };

  const iframeHeight = () => {
    const d = data();
    return d?.embedCode ? extractIframeHeight(d.embedCode) : 400;
  };

  let iframeRef: HTMLIFrameElement | undefined;

  const onMessage = (e: MessageEvent) => {
    if (!e.data?.["datawrapper-height"] || !iframeRef) return;
    for (const key in e.data["datawrapper-height"]) {
      if (iframeRef.contentWindow === e.source) {
        iframeRef.style.height = e.data["datawrapper-height"][key] + "px";
      }
    }
  };

  onMount(() => window.addEventListener("message", onMessage));
  onCleanup(() => window.removeEventListener("message", onMessage));

  return (
    <Show when={iframeSrc()}>
      {(src) => (
        <iframe
          ref={iframeRef}
          class={styles["widget-iframe"]}
          src={src()}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          style={{ height: `${iframeHeight()}px` }}
          title="Data visualization"
        />
      )}
    </Show>
  );
}

function BodyParagraph(props: { segments: TextSegment[]; lang: string; onNavigate?: (contentId: number, lang: string) => void }) {
  return (
    <p>
      <For each={props.segments}>
        {(seg) => (
          <Switch>
            <Match when={seg.type === "plain"}>
              {(seg as Extract<TextSegment, { type: "plain" }>).text}
            </Match>
            <Match when={seg.type === "link"}>
              {(() => {
                const link = seg as Extract<TextSegment, { type: "link" }>;
                if (link.contentId && props.onNavigate) {
                  return (
                    <a
                      class={styles["body-link"]}
                      href="#"
                      onClick={(e) => { e.preventDefault(); props.onNavigate!(link.contentId!, props.lang); }}
                    >
                      {link.text}
                    </a>
                  );
                }
                return (
                  <a
                    class={styles["body-link"]}
                    href={link.internal ? `https://www.dw.com${link.href}` : link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.text}<svg class={styles["body-link-icon"]} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></svg>
                  </a>
                );
              })()}
            </Match>
          </Switch>
        )}
      </For>
    </p>
  );
}

export type CardProps = {
  content: CardContent;
  liked: boolean;
  saved: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onNextSimilar?: () => void;
  onNavigate?: (contentId: number, lang: string) => void;
  expandRef?: (fn: () => void) => void;
  onExpandChange?: (expanded: boolean) => void;
  listenRef?: (fn: () => void) => void;
  onListenChange?: (speaking: boolean) => void;
};

export function Card(props: CardProps) {
  const cardWidth = () => typeof window !== "undefined" ? Math.min(window.innerWidth, 720) : 720;
  const img = () => resolveImage(props.content.mainContentImage?.staticUrl, "60X", cardWidth());
  const dwLink = () => buildDwLink(props.content);

  const [expanded, setExpanded] = createSignal(false);
  const [bodyBlocks, setBodyBlocks] = createSignal<BodyBlock[] | null>(null);
  const [bodyLoading, setBodyLoading] = createSignal(false);
  const [bodyError, setBodyError] = createSignal(false);
  const [heroReady, setHeroReady] = createSignal(false);
  const [speaking, setSpeaking] = createSignal(false);

  const stopSpeaking = () => {
    if (speechSupported()) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  createEffect(() => {
    void props.content.id;
    setExpanded(false);
    setBodyBlocks(null);
    setBodyLoading(false);
    setBodyError(false);
    setHeroReady(false);
    stopSpeaking();
    props.onExpandChange?.(false);
  });

  onCleanup(stopSpeaking);

  createEffect(() => {
    props.onListenChange?.(speaking());
  });

  async function speakText(text: string) {
    if (!speechSupported() || !text.trim()) return;
    const bcp47 = bcp47ForLang(props.content.language);
    const voices = await getVoicesAsync();
    const voice = pickVoice(voices, bcp47);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else if (bcp47) {
      utter.lang = bcp47;
    }
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  async function loadBody(): Promise<BodyBlock[]> {
    const existing = bodyBlocks();
    if (existing !== null) return existing;
    setBodyLoading(true);
    setBodyError(false);
    try {
      const html = await fetchBody(props.content.id, props.content.language);
      const blocks = htmlToBlocks(html);
      setBodyBlocks(blocks);
      if (blocks.length === 0) setBodyError(true);
      return blocks;
    } catch {
      setBodyError(true);
      return [];
    } finally {
      setBodyLoading(false);
    }
  }

  async function handleListen() {
    if (speaking()) {
      stopSpeaking();
      return;
    }
    const blocks = await loadBody();
    const gallery = isGallery()
      ? galleryItems()
          .map((g) => [g.name, g.description].filter(Boolean).join(". "))
          .filter(Boolean)
          .join("\n\n")
      : "";
    const parts = [
      props.content.title || "",
      summaryText(props.content),
      blocksToText(blocks),
      gallery,
      isLiveblog() ? "Read more on dw.com." : "",
    ].filter(Boolean);
    speakText(parts.join("\n\n"));
  }

  async function handleExpand() {
    if (expanded()) {
      setExpanded(false);
      props.onExpandChange?.(false);
      return;
    }
    setExpanded(true);
    props.onExpandChange?.(true);
    void loadBody();
  }

  props.expandRef?.(() => void handleExpand());
  props.listenRef?.(() => void handleListen());

  const isVideo = () => props.content.modelType === "VIDEO" && !!props.content.hlsVideoSrc;
  const isAudio = () => props.content.modelType === "AUDIO" && !!props.content.mp3Src;
  const isGallery = () => props.content.modelType === "IMAGE_GALLERY" && !!props.content.extendedGalleryImages?.length;
  const isLiveblog = () => props.content.modelType === "LIVEBLOG";

  const galleryItems = () =>
    (props.content.extendedGalleryImages || [])
      .filter((g) => g.assignedImage?.staticUrl)
      .map((g) => ({
        name: g.name,
        description: g.description,
        src: resolveImage(g.assignedImage!.staticUrl, "90X", 600) || "",
      }));

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
          <Show when={!heroReady()}>
            <div class={styles["feed-card-img-placeholder"]} />
          </Show>
          <img
            class={styles["feed-card-img"]}
            classList={{ [styles["feed-card-img-hidden"]]: !heroReady() }}
            src={img()}
            alt=""
            onLoad={() => setHeroReady(true)}
          />
        </Match>
      </Switch>

      <div class={styles["feed-card-body"]} classList={{ [styles["feed-card-body-waiting"]]: !!(img() && !heroReady() && !isVideo() && !isAudio()) }}>
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

        <Switch>
          <Match when={isGallery()}>
            <div class={styles["feed-card-gallery"]}>
              <For each={galleryItems()}>
                {(item) => (
                  <div class={styles["gallery-item"]}>
                    <img
                      class={styles["gallery-item-img"]}
                      src={item.src}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                    />
                    <Show when={item.name}>
                      <p class={styles["gallery-item-name"]}>{item.name}</p>
                    </Show>
                    <Show when={item.description}>
                      <p class={styles["gallery-item-desc"]}>{item.description}</p>
                    </Show>
                  </div>
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
            </div>
          </Match>
          <Match when={true}>
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
                      <Switch>
                        <Match when={block.kind === "text"}>
                          <BodyParagraph
                            segments={(block as Extract<BodyBlock, { kind: "text" }>).segments}
                            lang={props.content.language}
                            onNavigate={props.onNavigate}
                          />
                        </Match>
                        <Match when={block.kind === "image"}>
                          <img
                            class={styles["body-img"]}
                            src={(block as Extract<BodyBlock, { kind: "image" }>).src}
                            alt={(block as Extract<BodyBlock, { kind: "image" }>).alt}
                            loading="lazy"
                            decoding="async"
                          />
                        </Match>
                        <Match when={block.kind === "widget"}>
                          <WidgetEmbed
                            id={(block as Extract<BodyBlock, { kind: "widget" }>).id}
                            lang={(block as Extract<BodyBlock, { kind: "widget" }>).lang}
                          />
                        </Match>
                      </Switch>
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
                <Show when={isLiveblog()}>
                  <a
                    class={styles["liveblog-cta"]}
                    href={dwLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="8" cy="8" r="4" />
                    </svg>
                    Follow live updates on dw.com
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 4h6v6M10 14L20 4" />
                    </svg>
                  </a>
                </Show>
              </div>
            </Show>
          </Match>
        </Switch>
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

        <Show when={speechSupported() && !isVideo() && !isAudio()}>
          <button
            type="button"
            class={styles["action-btn"]}
            data-active={speaking()}
            onClick={() => handleListen()}
            aria-pressed={speaking()}
            aria-label={speaking() ? "Stop reading article aloud" : "Read article aloud"}
          >
            <Show
              when={!speaking()}
              fallback={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              }
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </Show>
            <span class={styles["action-label"]}>{speaking() ? "Stop" : "Listen"}</span>
          </button>
        </Show>

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
