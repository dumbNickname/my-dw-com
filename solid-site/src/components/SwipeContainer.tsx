import { createSignal, onMount, onCleanup, type JSX } from "solid-js";
import styles from "./SwipeContainer.module.css";

const THRESHOLD = 80;
const HANDLE_THRESHOLD = 40;
const ANGLE_RATIO = 2;

export type SwipeDirection = "advance" | "interesting";

export type SwipeContainerProps = {
  onSwipe: (dir: SwipeDirection) => void;
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("resize", updateDesktop);
      window.removeEventListener("keydown", handleKeyDown);
    });
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
            <path d="M11 3l-5 5 5 5" />
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

      {/* Desktop side buttons */}
      <button
        type="button"
        class={`${styles["side-btn"]} ${styles["side-btn-advance"]}`}
        onClick={() => props.onSwipe("advance")}
        aria-label="Skip to next article"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 3l-5 5 5 5" />
        </svg>
        <span>Next</span>
      </button>
      <button
        type="button"
        class={`${styles["side-btn"]} ${styles["side-btn-interesting"]}`}
        onClick={() => props.onSwipe("interesting")}
        aria-label="Mark as interesting and continue"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2l1.5 4.5H14l-3.5 2.8L12 14 8 11l-4 3 1.5-4.7L2 6.5h4.5z" />
        </svg>
        <span>Interesting</span>
      </button>

      {props.children}
    </div>
  );
}
