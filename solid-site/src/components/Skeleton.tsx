/**
 * Skeleton placeholders. CSS-only shimmer; collapses to plain block under
 * `prefers-reduced-motion: reduce`.
 *
 * Self-contained shells (`.card-shell`, `.carousel-shell`) so loading
 * states stay independent of the real Card / CarouselCard styles.
 */
import styles from "./Skeleton.module.css";

export function CardSkeleton() {
  return (
    <div class={styles["card-shell"]} aria-busy="true" aria-label="Loading article">
      <div class={`${styles.skeleton} ${styles["skeleton-img"]}`} />
      <div class={styles["card-shell-body"]}>
        <div class={`${styles.skeleton} ${styles["skeleton-line"]} ${styles.short}`} />
        <div class={`${styles.skeleton} ${styles["skeleton-line"]}`} />
        <div class={`${styles.skeleton} ${styles["skeleton-line"]} ${styles.med}`} />
      </div>
    </div>
  );
}

export function CarouselSkeleton() {
  return (
    <div class={styles["carousel-shell"]} aria-busy="true">
      {Array.from({ length: 4 }).map(() => (
        <div class={styles["carousel-item-shell"]}>
          <div
            class={`${styles.skeleton} ${styles["skeleton-img"]}`}
            style={{ "border-radius": 0 }}
          />
          <div class={styles["carousel-item-body-shell"]}>
            <div class={`${styles.skeleton} ${styles["skeleton-line"]} ${styles.short}`} />
            <div class={`${styles.skeleton} ${styles["skeleton-line"]} ${styles.med}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
