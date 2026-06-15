/**
 * Bottom-sheet showing the user's saved articles.
 *
 * Opens from the Save pill in the feed action bar. Closes on backdrop
 * tap, on the X button, or on Escape. List rows link out to dw.com (the
 * /saved route + canonical /article/:id detail view land in M3).
 *
 * Visual: slides up from the bottom on mobile, dropdown-style modal on
 * desktop. Sheet height capped at 80dvh; rows scroll inside.
 */
import { For, Show, createEffect, onCleanup } from "solid-js";

import type { SavedItem } from "~/lib/profile";

type Props = {
  open: boolean;
  items: SavedItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
};

const buildDwLink = (s: SavedItem): string => {
  if (s.namedUrl) return `https://www.dw.com${s.namedUrl}`;
  const slug = (s.lang || "ENGLISH").toLowerCase().slice(0, 2);
  return `https://www.dw.com/${slug}/a-${s.id}`;
};

export function SavedSheet(props: Props) {
  // Esc-to-close + body scroll lock while open.
  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    });
  });

  return (
    <Show when={props.open}>
      <div class="sheet-backdrop" onClick={() => props.onClose()} aria-hidden="true" />
      <aside
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Saved articles"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="sheet-head">
          <h2 class="sheet-title">
            Saved
            <span class="sheet-count">{props.items.length}</span>
          </h2>
          <button
            type="button"
            class="sheet-close"
            onClick={() => props.onClose()}
            aria-label="Close saved list"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </header>

        <Show
          when={props.items.length > 0}
          fallback={
            <div class="sheet-empty">
              <strong>Nothing saved yet.</strong>
              <p>Tap the bookmark icon on any card to keep it for later.</p>
            </div>
          }
        >
          <ul class="sheet-list">
            <For each={props.items}>
              {(item) => (
                <li class="sheet-row">
                  <a
                    class="sheet-row-link"
                    href={buildDwLink(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Show when={item.image}>
                      <img class="sheet-row-img" src={item.image!} alt="" loading="lazy" />
                    </Show>
                    <div class="sheet-row-body">
                      <Show when={item.kicker}>
                        <span class="sheet-row-kicker">{item.kicker}</span>
                      </Show>
                      <span class="sheet-row-title">{item.title}</span>
                    </div>
                  </a>
                  <button
                    type="button"
                    class="sheet-row-remove"
                    onClick={() => props.onRemove(item.id)}
                    aria-label={`Remove ${item.title}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                      <path d="M3 3l10 10M13 3L3 13" />
                    </svg>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </aside>
    </Show>
  );
}
