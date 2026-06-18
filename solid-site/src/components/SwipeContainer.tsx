import { createSignal, createEffect, onMount, onCleanup, Show, type JSX } from "solid-js";
import styles from "./SwipeContainer.module.css";

const THRESHOLD = 80;
const HANDLE_THRESHOLD = 40;
const ANGLE_RATIO = 2;
const HINT_MAX = 3;

let sessionHintCount = 0;

export type SwipeDirection = "advance" | "interesting";

export type SwipeContainerProps = {
  onSwipe: (dir: SwipeDirection) => void;
  onToggleExpand?: () => void;
  showHint?: boolean;
  hintKey?: string | number;
  liked?: boolean;
  saved?: boolean;
  dwLink?: string;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  children: JSX.Element;
};

export function SwipeContainer(props: SwipeContainerProps) {
  let wrapperRef: HTMLDivElement | undefined;
  let overlayLeftRef: HTMLDivElement | undefined;
  let overlayRightRef: HTMLDivElement | undefined;

  const [isDesktop, setIsDesktop] = createSignal(false);

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let locked = false;
  let onHandle = false;

  const updateDesktop = () => setIsDesktop(window.innerWidth >= 900);

  let hintTimers: number[] = [];

  function setHintTransition(on: boolean) {
    const dur = on ? "600ms" : "";
    if (overlayLeftRef) overlayLeftRef.style.transitionDuration = dur;
    if (overlayRightRef) overlayRightRef.style.transitionDuration = dur;
  }

  function playHint() {
    if (isDesktop() || !props.showHint || sessionHintCount >= HINT_MAX) return;
    sessionHintCount += 1;

    hintTimers.push(window.setTimeout(() => {
      setHintTransition(true);
      showOverlay("left", 1);

      hintTimers.push(window.setTimeout(() => {
        resetOverlays();

        hintTimers.push(window.setTimeout(() => {
          showOverlay("right", 1);

          hintTimers.push(window.setTimeout(() => {
            resetOverlays();

            hintTimers.push(window.setTimeout(() => {
              showOverlay("left", 1);
              showOverlay("right", 1);

              hintTimers.push(window.setTimeout(() => {
                resetOverlays();
                hintTimers.push(window.setTimeout(() => setHintTransition(false), 700));
              }, 1800));
            }, 1000));
          }, 1500));
        }, 1000));
      }, 1500));
    }, 4000));
  }

  function clearHintTimers() {
    hintTimers.forEach(clearTimeout);
    hintTimers = [];
  }

  onMount(() => {
    updateDesktop();
    window.addEventListener("resize", updateDesktop);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        props.onSwipe("advance");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        props.onSwipe("interesting");
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && props.onToggleExpand) {
        e.preventDefault();
        props.onToggleExpand();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      clearHintTimers();
      window.removeEventListener("resize", updateDesktop);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  createEffect(() => {
    void props.hintKey;
    clearHintTimers();
    resetOverlays();
    playHint();
  });

  const showOverlay = (dir: "left" | "right", progress: number) => {
    const el = dir === "left" ? overlayLeftRef : overlayRightRef;
    if (!el) return;
    const clamped = Math.min(1, progress);
    const translate = dir === "left"
      ? `translateX(${-100 + clamped * 100}%)`
      : `translateX(${100 - clamped * 100}%)`;
    el.style.transform = translate;
    el.style.opacity = String(clamped);
  };

  const resetOverlays = () => {
    if (overlayLeftRef) {
      overlayLeftRef.style.transform = "translateX(-100%)";
      overlayLeftRef.style.opacity = "0";
    }
    if (overlayRightRef) {
      overlayRightRef.style.transform = "translateX(100%)";
      overlayRightRef.style.opacity = "0";
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (isDesktop()) return;
    const target = e.target as HTMLElement;
    onHandle = target.classList?.contains(styles.handle) ||
      target.classList?.contains(styles["handle-left"]) ||
      target.classList?.contains(styles["handle-right"]);
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    locked = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || isDesktop()) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * ANGLE_RATIO) {
        dragging = false;
        resetOverlays();
        return;
      }
      if (Math.abs(dx) > 10) {
        locked = true;
      } else {
        return;
      }
    }

    const threshold = onHandle ? HANDLE_THRESHOLD : THRESHOLD;
    if (dx < 0) {
      showOverlay("left", Math.abs(dx) / threshold);
    } else {
      showOverlay("right", dx / threshold);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragging || isDesktop()) return;
    dragging = false;
    const dx = e.clientX - startX;
    const threshold = onHandle ? HANDLE_THRESHOLD : THRESHOLD;

    if (locked && Math.abs(dx) >= threshold) {
      if (dx < 0) {
        props.onSwipe("advance");
      } else {
        props.onSwipe("interesting");
      }
    }
    resetOverlays();
    locked = false;
    onHandle = false;
  };

  return (
    <div
      ref={wrapperRef}
      class={styles.wrapper}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragging = false; resetOverlays(); }}
    >
      {/* Mobile overlays */}
      <div ref={overlayLeftRef} class={`${styles.overlay} ${styles["overlay-advance"]}`}>
        <div class={styles["overlay-inner"]}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 5l5 5 5-5" />
          </svg>
          <span>Next</span>
        </div>
      </div>
      <div ref={overlayRightRef} class={`${styles.overlay} ${styles["overlay-interesting"]}`}>
        <div class={styles["overlay-inner"]}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2l1.5 4.5H14l-3.5 2.8L12 14 8 11l-4 3 1.5-4.7L2 6.5h4.5z" />
          </svg>
          <span>Interesting</span>
        </div>
      </div>

      {/* Mobile edge handles */}
      <div class={`${styles.handle} ${styles["handle-left"]}`} />
      <div class={`${styles.handle} ${styles["handle-right"]}`} />

      <div class={styles.screen}>
        {props.children}
      </div>

      {/* Desktop control panel (right side in vintage, below in classic) */}
      <div class={styles["control-panel"]}>
        <Show when={props.onToggleLike}>
          <div class={styles["key-grid"]}>
            <button
              type="button"
              class={styles.key}
              data-active={props.liked}
              onClick={() => props.onToggleLike?.()}
              aria-label={props.liked ? "Unlike" : "Like"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={props.liked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5 5.5 5c2 0 3.5 1.2 4.5 2.5C11 6.2 12.5 5 14.5 5 18 5 19.5 9 17.5 12.5 15 16.65 12 21 12 21z" />
              </svg>
            </button>
            <button
              type="button"
              class={styles.key}
              data-active={props.saved}
              onClick={() => props.onToggleSave?.()}
              aria-label={props.saved ? "Unsave" : "Save"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={props.saved ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                <path d="M6 4h12v17l-6-4-6 4z" />
              </svg>
            </button>
            <button
              type="button"
              class={styles.key}
              onClick={() => props.onToggleExpand?.()}
              aria-label="Read / Collapse"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <Show when={props.dwLink}>
              <a
                class={styles.key}
                href={props.dwLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open on dw.com"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
                  <path d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
                </svg>
              </a>
            </Show>
          </div>
        </Show>
        <div class={styles["dial-divider"]} />
        <button
          type="button"
          class={`${styles.dial} ${styles["dial-advance"]}`}
          onClick={() => props.onSwipe("advance")}
          aria-label="Skip to next article"
        >
          <span class={styles["dial-knob"]}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 3l5 5-5 5" />
            </svg>
          </span>
          <span class={styles["dial-label"]}>Next</span>
        </button>
        <div class={styles["dial-divider"]} />
        <button
          type="button"
          class={`${styles.dial} ${styles["dial-interesting"]}`}
          onClick={() => props.onSwipe("interesting")}
          aria-label="Mark as interesting and continue"
        >
          <span class={styles["dial-knob"]}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 2l1.5 4.5H14l-3.5 2.8L12 14 8 11l-4 3 1.5-4.7L2 6.5h4.5z" />
            </svg>
          </span>
          <span class={styles["dial-label"]}>Interesting</span>
        </button>
      </div>
    </div>
  );
}
