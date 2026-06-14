/**
 * Skeleton placeholders. CSS-only shimmer; collapses to plain block under
 * `prefers-reduced-motion: reduce`.
 */

export function CardSkeleton() {
  return (
    <div class="feed-card" aria-busy="true" aria-label="Loading article">
      <div class="skeleton skeleton-img" />
      <div class="feed-card-body">
        <div class="skeleton skeleton-line short" />
        <div class="skeleton skeleton-line" />
        <div class="skeleton skeleton-line med" />
      </div>
    </div>
  );
}

export function CarouselSkeleton() {
  return (
    <div class="carousel" aria-busy="true">
      {Array.from({ length: 4 }).map(() => (
        <div class="carousel-item">
          <div class="skeleton skeleton-img" style={{ "border-radius": 0 }} />
          <div class="carousel-item-body">
            <div class="skeleton skeleton-line short" />
            <div class="skeleton skeleton-line med" />
          </div>
        </div>
      ))}
    </div>
  );
}
