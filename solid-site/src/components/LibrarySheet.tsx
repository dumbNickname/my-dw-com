/**
 * Library bottom-sheet — shows the user's Saved and Liked articles.
 *
 * Tabs at the top let the user switch between [Saved (n)] [Liked (m)].
 * Default tab is whichever has items; if both do, Saved wins. Each row
 * links out to dw.com (the proper /article/:id detail view ships in M3).
 *
 * Same visual treatment per row regardless of tab, since SavedItem and
 * LikedItem share the LibraryItem shape.
 *
 * Closes on backdrop tap, Escape, or X button. Body scroll is locked
 * while open.
 */
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

import type { LibraryItem } from "~/lib/profile";

import styles from "./LibrarySheet.module.css";

type Tab = "saved" | "liked";

type Props = {
  open: boolean;
  saved: LibraryItem[];
  liked: LibraryItem[];
  onClose: () => void;
  onRemoveSaved: (id: string) => void;
  onRemoveLiked: (id: string) => void;
};

const buildDwLink = (s: LibraryItem): string => {
  if (s.namedUrl) return `https://www.dw.com${s.namedUrl}`;
  const slug = (s.lang || "ENGLISH").toLowerCase().slice(0, 2);
  return `https://www.dw.com/${slug}/a-${s.id}`;
};

export function LibrarySheet(props: Props) {
  const [tab, setTab] = createSignal<Tab>("saved");

  // When the sheet opens, default to whichever tab has items.
  createEffect(() => {
    if (!props.open) return;
    if (props.saved.length === 0 && props.liked.length > 0) setTab("liked");
    else setTab("saved");
  });

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

  const items = () => (tab() === "saved" ? props.saved : props.liked);
  const onRemove = (id: string) =>
    tab() === "saved" ? props.onRemoveSaved(id) : props.onRemoveLiked(id);

  return (
    <Show when={props.open}>
      <div class={styles["sheet-backdrop"]} onClick={() => props.onClose()} aria-hidden="true" />
      <aside
        class={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Library"
        onClick={(e) => e.stopPropagation()}
      >
        <header class={styles["sheet-head"]}>
          <div class={styles["sheet-tabs"]} role="tablist">
            <button
              type="button"
              class={styles["sheet-tab"]}
              data-active={tab() === "saved"}
              role="tab"
              aria-selected={tab() === "saved"}
              onClick={() => setTab("saved")}
            >
              Saved
              <span class={styles["sheet-tab-count"]}>{props.saved.length}</span>
            </button>
            <button
              type="button"
              class={styles["sheet-tab"]}
              data-active={tab() === "liked"}
              role="tab"
              aria-selected={tab() === "liked"}
              onClick={() => setTab("liked")}
            >
              Liked
              <span class={styles["sheet-tab-count"]}>{props.liked.length}</span>
            </button>
          </div>
          <button
            type="button"
            class={styles["sheet-close"]}
            onClick={() => props.onClose()}
            aria-label="Close library"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </header>

        <Show
          when={items().length > 0}
          fallback={
            <div class={styles["sheet-empty"]}>
              <Show
                when={tab() === "saved"}
                fallback={
                  <>
                    <strong>No liked articles yet.</strong>
                    <p>Tap the heart on any card to mark it.</p>
                  </>
                }
              >
                <strong>Nothing saved yet.</strong>
                <p>Tap the bookmark icon on any card to keep it for later.</p>
              </Show>
            </div>
          }
        >
          <ul class={styles["sheet-list"]} role="tabpanel">
            <For each={items()}>
              {(item) => (
                <li class={styles["sheet-row"]}>
                  <a
                    class={styles["sheet-row-link"]}
                    href={buildDwLink(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Show when={item.image}>
                      <img class={styles["sheet-row-img"]} src={item.image!} alt="" loading="lazy" />
                    </Show>
                    <div class={styles["sheet-row-body"]}>
                      <Show when={item.kicker}>
                        <span class={styles["sheet-row-kicker"]}>{item.kicker}</span>
                      </Show>
                      <span class={styles["sheet-row-title"]}>{item.title}</span>
                    </div>
                  </a>
                  <button
                    type="button"
                    class={styles["sheet-row-remove"]}
                    onClick={() => onRemove(item.id)}
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
