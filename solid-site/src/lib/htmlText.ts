const SENTINEL = "\u2407";
const BLOCK_BREAKS = /<\/(?:p|h[1-6]|li|div|blockquote|tr)>/gi;
const STRIP_BLOCKS =
  /<(script|style|video|audio|svg|iframe|object|embed|noscript)[\s\S]*?<\/\1>/gi;
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

const FIGURE_RE = /<figure[^>]*>[\s\S]*?<\/figure>/gi;
const DATA_URL_RE = /data-url="([^"]+)"/;
const ALT_RE = /alt="([^"]*)"/;

const WIDGET_RE = /<div[^>]*class="[^"]*\bdw-widget\b[^"]*"[^>]*><\/div>/gi;
const WIDGET_ID_RE = /data-id="(\d+)"/;
const WIDGET_LANG_RE = /data-lang-code="([^"]+)"/;

function resolveBodyImageUrl(dataUrl: string): string {
  if (dataUrl.includes("${formatId}")) {
    return dataUrl.replace("${formatId}", "902");
  }
  return dataUrl;
}

export type TextSegment =
  | { type: "plain"; text: string }
  | { type: "link"; text: string; href: string; internal: boolean; contentId?: number };

export type BodyBlock =
  | { kind: "text"; segments: TextSegment[] }
  | { kind: "image"; src: string; alt: string }
  | { kind: "widget"; id: number; lang: string };

const LINK_RE = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
const HREF_RE = /href="([^"]+)"/;
const INTERNAL_CLASS_RE = /class="[^"]*\binternal-link\b[^"]*"/;
const DW_CONTENT_ID_RE = /\/(?:a|av|video|audio|live)-(\d+)/;

function extractSegments(chunk: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  const linkRe = new RegExp(LINK_RE.source, "gi");
  let lm: RegExpExecArray | null;

  while ((lm = linkRe.exec(chunk)) !== null) {
    if (lm.index > cursor) {
      const plain = chunk.slice(cursor, lm.index).replace(TAG, " ");
      const decoded = decodeEntities(plain).replace(/\s+/g, " ");
      if (decoded.trim()) segments.push({ type: "plain", text: decoded });
    }

    const hrefMatch = HREF_RE.exec(lm[0]);
    const linkText = decodeEntities(lm[0].replace(STRIP_BLOCKS, "").replace(TAG, "")).replace(/\s+/g, " ").trim();
    if (hrefMatch && linkText) {
      const isInternal = INTERNAL_CLASS_RE.test(lm[0]);
      const href = decodeEntities(hrefMatch[1]);
      const contentIdMatch = DW_CONTENT_ID_RE.exec(href);
      segments.push({
        type: "link",
        text: linkText,
        href,
        internal: isInternal,
        contentId: contentIdMatch ? Number(contentIdMatch[1]) : undefined,
      });
    } else if (linkText) {
      segments.push({ type: "plain", text: linkText });
    }

    cursor = lm.index + lm[0].length;
  }

  if (cursor < chunk.length) {
    const plain = chunk.slice(cursor).replace(TAG, " ");
    const decoded = decodeEntities(plain).replace(/\s+/g, " ");
    if (decoded.trim()) segments.push({ type: "plain", text: decoded });
  }

  return segments;
}

function extractParagraphs(chunk: string): BodyBlock[] {
  const withBreaks = chunk.replace(BLOCK_BREAKS, SENTINEL);
  const parts = withBreaks.split(SENTINEL);
  const blocks: BodyBlock[] = [];

  for (const part of parts) {
    const segments = extractSegments(part);
    const textContent = segments.map((s) => s.text).join("").trim();
    if (textContent.length > 0) {
      blocks.push({ kind: "text", segments });
    }
  }

  return blocks;
}

export function htmlToBlocks(html: string | null | undefined): BodyBlock[] {
  if (!html) return [];

  const blocks: BodyBlock[] = [];
  let cursor = 0;

  const noScripts = html.replace(STRIP_BLOCKS, " ");

  type Marker = { index: number; length: number; block: BodyBlock };
  const markers: Marker[] = [];

  let fm: RegExpExecArray | null;
  const figRe = new RegExp(FIGURE_RE.source, "gi");
  while ((fm = figRe.exec(noScripts)) !== null) {
    const urlMatch = DATA_URL_RE.exec(fm[0]);
    if (!urlMatch) continue;
    const altMatch = ALT_RE.exec(fm[0]);
    markers.push({
      index: fm.index,
      length: fm[0].length,
      block: { kind: "image", src: resolveBodyImageUrl(urlMatch[1]), alt: altMatch ? decodeEntities(altMatch[1]) : "" },
    });
  }

  const widRe = new RegExp(WIDGET_RE.source, "gi");
  while ((fm = widRe.exec(noScripts)) !== null) {
    const idMatch = WIDGET_ID_RE.exec(fm[0]);
    if (!idMatch) continue;
    const langMatch = WIDGET_LANG_RE.exec(fm[0]);
    markers.push({
      index: fm.index,
      length: fm[0].length,
      block: { kind: "widget", id: Number(idMatch[1]), lang: (langMatch?.[1] || "en").toUpperCase() },
    });
  }

  markers.sort((a, b) => a.index - b.index);

  for (const m of markers) {
    const before = noScripts.slice(cursor, m.index);
    blocks.push(...extractParagraphs(before));
    blocks.push(m.block);
    cursor = m.index + m.length;
  }

  const tail = noScripts.slice(cursor);
  blocks.push(...extractParagraphs(tail));

  return blocks;
}

export function htmlToParagraphs(html: string | null | undefined): string[] {
  return htmlToBlocks(html)
    .filter((b): b is Extract<BodyBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.segments.map((s) => s.text).join(""));
}
