/**
 * Feed card — the single full-screen content the user reads on tap.
 *
 * Shows: image, kicker, title, summary, language badge, relative date.
 * Bottom action bar: "Open on dw.com" + "Next".
 * Like / Save / Read-more land in M2.
 */
import { Show } from "solid-js";

import type { CardContent } from "~/lib/graphql";
import { resolveImage } from "~/lib/image";

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
  // Fallback URL that DW redirects on its end:
  const langSlug = (content.language || "ENGLISH").toLowerCase().slice(0, 2);
  return `https://www.dw.com/${langSlug}/a-${content.id}`;
};

const langShort = (lang: string | null | undefined): string =>
  (lang || "EN").toUpperCase().slice(0, 2);

const summaryText = (c: CardContent): string => c.shortTeaser || c.teaser || "";

export function Card(props: {
  content: CardContent;
  onNext: () => void;
  hasNext: boolean;
}) {
  const img = () => resolveImage(props.content.mainContentImage?.staticUrl, "60X", 720);
  const dwLink = () => buildDwLink(props.content);

  return (
    <article class="feed-card" aria-label={props.content.title || "Article"}>
      <Show when={img()}>
        <img
          class="feed-card-img"
          src={img()}
          alt=""
          loading="eager"
          decoding="async"
          fetchpriority="high"
        />
      </Show>

      <div class="feed-card-body">
        <div class="feed-card-meta">
          <Show when={props.content.roadTeaserKicker}>
            <span class="feed-card-kicker">{props.content.roadTeaserKicker}</span>
          </Show>
          <span class="feed-card-lang" title={props.content.language || ""}>
            {langShort(props.content.language)}
          </span>
          <Show when={props.content.contentDate}>
            <span>{formatRelative(props.content.contentDate)}</span>
          </Show>
          <Show when={props.content.formattedDurationInMinutes}>
            <span>· {props.content.formattedDurationInMinutes} min</span>
          </Show>
        </div>

        <h1 class="feed-card-title">{props.content.title}</h1>

        <Show when={summaryText(props.content)}>
          <p class="feed-card-summary">{summaryText(props.content)}</p>
        </Show>

        <div class="feed-actions">
          <a
            class="canon-link"
            href={dwLink()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on dw.com ↗
          </a>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => props.onNext()}
            disabled={!props.hasNext}
            aria-label="Next article"
          >
            Next
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
    </article>
  );
}
