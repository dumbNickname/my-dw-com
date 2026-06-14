/**
 * DW image URL resolver.
 *
 * mainContentImage.staticUrl from the GraphQL API contains a literal
 * `${formatId}` placeholder, e.g.
 *   https://static.dw.com/image/77528576_${formatId}.jpg
 *
 * Pick a format id from the right group (16:9 landscape by default) at
 * the right resolution for the rendered width, then substitute.
 *
 * Ladder lifted from dw/webapp/src/utils/imgUtils.js (verified).
 */

export type FormatGroup = "60X" | "80X" | "90X" | "100X";

type Format = { id: number; width: number };

const LADDERS: Record<FormatGroup, Format[]> = {
  // landscape 16:9 — default
  "60X": [
    { id: 600, width: 78 },
    { id: 601, width: 201 },
    { id: 602, width: 379 },
    { id: 603, width: 545 },
    { id: 604, width: 767 },
    { id: 605, width: 1199 },
    { id: 606, width: 1568 },
    { id: 607, width: 1920 },
  ],
  // square 1:1 — thumbs
  "80X": [
    { id: 800, width: 50 },
    { id: 801, width: 129 },
    { id: 802, width: 352 },
    { id: 803, width: 575 },
    { id: 804, width: 767 },
    { id: 805, width: 1024 },
    { id: 806, width: 1400 },
  ],
  // mixed aspect — inline body figures
  "90X": [
    { id: 900, width: 48 },
    { id: 901, width: 375 },
    { id: 902, width: 475 },
    { id: 903, width: 600 },
    { id: 904, width: 768 },
    { id: 905, width: 960 },
    { id: 906, width: 1110 },
  ],
  // cinemascope 16:7 — wide hero (rare)
  "100X": [
    { id: 1000, width: 80 },
    { id: 1001, width: 576 },
    { id: 1002, width: 768 },
    { id: 1003, width: 992 },
    { id: 1004, width: 1200 },
    { id: 1005, width: 1408 },
    { id: 1006, width: 1600 },
  ],
};

const dpr = (): number => {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
};

function pick(group: FormatGroup, targetCssPx: number): number {
  const ladder = LADDERS[group];
  const target = targetCssPx * dpr();
  return (ladder.find((f) => f.width >= target) ?? ladder[ladder.length - 1]).id;
}

export function resolveImage(
  staticUrl: string | undefined | null,
  group: FormatGroup,
  targetCssPx: number,
): string | undefined {
  if (!staticUrl) return undefined;
  return staticUrl.replace("${formatId}", String(pick(group, targetCssPx)));
}
