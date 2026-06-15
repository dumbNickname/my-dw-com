/**
 * Strip HTML and decode entities into clean paragraphs.
 *
 * The card body field returns full DW article HTML with `<p>`, `<h2>`,
 * `<figure>`, raw embed `<div>`s, `<video>` tags, and so on. M3 will
 * ship a proper DOMPurify-based sanitiser that preserves the structure
 * and rewrites embed placeholders. For this slice we render plain
 * paragraphs only, which sidesteps every XSS surface and keeps the
 * dependency footprint at zero.
 *
 * Strategy:
 *   1. Drop entire `<script>`, `<style>`, `<video>`, `<audio>`,
 *      `<figure>`, `<svg>`, and embed `<div>`s — these never have
 *      meaningful inline text we'd want to surface.
 *   2. Convert `</p>`, `</h*>`, `</li>`, `</div>` to a paragraph break
 *      sentinel so we can split into paragraphs after stripping.
 *   3. Strip remaining tags.
 *   4. Decode the small set of entities DW actually emits (we sampled
 *      `&#160;`, `&amp;`, `&quot;`, `&lt;`, `&gt;`, `&apos;`).
 *   5. Split on the sentinel, trim, drop empty.
 */

const SENTINEL = "\u2407"; // unlikely to appear in content
const BLOCK_BREAKS = /<\/(?:p|h[1-6]|li|div|blockquote|tr)>/gi;
const STRIP_BLOCKS =
  /<(script|style|video|audio|figure|svg|iframe|object|embed|noscript)[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, raw) => {
    if (raw.startsWith("#x") || raw.startsWith("#X")) {
      const cp = parseInt(raw.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    }
    if (raw.startsWith("#")) {
      const cp = parseInt(raw.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    }
    return NAMED_ENTITIES[raw.toLowerCase()] ?? "";
  });
}

/**
 * Returns an array of plain-text paragraphs in source order. Empty input
 * → empty array. Pass to a `<p>` map in the component.
 */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  const noBlocks = html.replace(STRIP_BLOCKS, " ");
  const withBreaks = noBlocks.replace(BLOCK_BREAKS, SENTINEL);
  const stripped = withBreaks.replace(TAG, " ");
  const decoded = decodeEntities(stripped);
  return decoded
    .split(SENTINEL)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}
