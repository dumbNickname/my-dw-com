/**
 * Onboarding carousel item — small selectable card sourced from
 * most-viewed. Tapping toggles selection and seeds `similar` later.
 */
import { Show } from "solid-js";

import type { CardContent } from "~/lib/graphql";
import { resolveImage } from "~/lib/image";

export function CarouselCard(props: {
  content: CardContent;
  selected: boolean;
  onToggle: () => void;
}) {
  const img = () => resolveImage(props.content.mainContentImage?.staticUrl, "60X", 220);
  return (
    <button
      type="button"
      class="carousel-item"
      data-selected={props.selected}
      aria-pressed={props.selected}
      onClick={() => props.onToggle()}
    >
      <Show when={img()} fallback={<div class="skeleton skeleton-img" />}>
        <img src={img()} alt="" loading="lazy" decoding="async" />
      </Show>
      <div class="carousel-item-body">
        <Show when={props.content.roadTeaserKicker}>
          <span class="carousel-item-kicker">{props.content.roadTeaserKicker}</span>
        </Show>
        <span class="carousel-item-title">{props.content.title}</span>
      </div>
    </button>
  );
}
