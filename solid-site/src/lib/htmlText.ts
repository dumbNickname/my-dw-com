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

function resolveBodyImageUrl(dataUrl: string): string {
  if (dataUrl.includes("${formatId}")) {
    return dataUrl.replace("${formatId}", "902");
  }
  return dataUrl;
}

export type BodyBlock =
  | { kind: "text"; content: string }
  | { kind: "image"; src: string; alt: string };

export function htmlToBlocks(html: string | null | undefined): BodyBlock[] {
  if (!html) return [];

  const blocks: BodyBlock[] = [];
  let cursor = 0;

  const noScripts = html.replace(STRIP_BLOCKS, " ");

  const figures: { index: number; length: number; src: string; alt: string }[] = [];
  let fm: RegExpExecArray | null;
  const figRe = new RegExp(FIGURE_RE.source, "gi");
  while ((fm = figRe.exec(noScripts)) !== null) {
    const urlMatch = DATA_URL_RE.exec(fm[0]);
    if (!urlMatch) continue;
    const altMatch = ALT_RE.exec(fm[0]);
    figures.push({
      index: fm.index,
      length: fm[0].length,
      src: resolveBodyImageUrl(urlMatch[1]),
      alt: altMatch ? decodeEntities(altMatch[1]) : "",
    });
  }

  function extractText(chunk: string): string[] {
    const withBreaks = chunk.replace(BLOCK_BREAKS, SENTINEL);
    const stripped = withBreaks.replace(TAG, " ");
    const decoded = decodeEntities(stripped);
    return decoded
      .split(SENTINEL)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);
  }

  for (const fig of figures) {
    const before = noScripts.slice(cursor, fig.index);
    for (const t of extractText(before)) {
      blocks.push({ kind: "text", content: t });
    }
    blocks.push({ kind: "image", src: fig.src, alt: fig.alt });
    cursor = fig.index + fig.length;
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
