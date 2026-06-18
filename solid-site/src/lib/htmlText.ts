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

export type BodyBlock =
  | { kind: "text"; content: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "widget"; id: number; lang: string };

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

  function extractText(chunk: string): string[] {
    const withBreaks = chunk.replace(BLOCK_BREAKS, SENTINEL);
    const stripped = withBreaks.replace(TAG, " ");
    const decoded = decodeEntities(stripped);
    return decoded
      .split(SENTINEL)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);
  }

  for (const m of markers) {
    const before = noScripts.slice(cursor, m.index);
    for (const t of extractText(before)) {
      blocks.push({ kind: "text", content: t });
    }
    blocks.push(m.block);
    cursor = m.index + m.length;
  }

  const tail = noScripts.slice(cursor);
  for (const t of extractText(tail)) {
    blocks.push({ kind: "text", content: t });
  }

  return blocks;
}

export function htmlToParagraphs(html: string | null | undefined): string[] {
  return htmlToBlocks(html)
    .filter((b): b is Extract<BodyBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.content);
}
