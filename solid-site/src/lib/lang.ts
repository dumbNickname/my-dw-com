/**
 * Language helpers — language list, browser detection, code conversion.
 *
 * The canonical list lives in `~/data/languages.json`. Each entry has:
 *   - enum     — the GraphQL `Language` enum value (uppercase). This is
 *                what PEACH and webapi.dw.com expect as `lang=...`.
 *   - code     — the ISO-ish DW code ("en", "pt-br", "zh-hant"). Used
 *                only for matching `navigator.language`.
 *   - english  — display name in English (for fallback / a11y).
 *   - native   — display name in the language itself.
 *   - popular  — flag for the 8 we surface by default in onboarding.
 *
 * Sourced from `~/own/dw/webapp/src/utils/langMapper.js` and
 * `LanguageSelector/languages.json` in the production webapp.
 */
import data from "~/data/languages.json";

export type Language = {
  enum: string;
  code: string;
  english: string;
  native: string;
  popular: boolean;
};

export const LANGUAGES: Language[] = data as Language[];

export const POPULAR_LANGUAGES: Language[] = LANGUAGES.filter((l) => l.popular);
export const OTHER_LANGUAGES: Language[] = LANGUAGES.filter((l) => !l.popular);

const BY_ENUM = new Map(LANGUAGES.map((l) => [l.enum, l]));
const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const byEnum = (e: string): Language | undefined => BY_ENUM.get(e);
export const byCode = (c: string): Language | undefined => BY_CODE.get(c);

/**
 * Best-effort browser language detection. Returns the GraphQL enum
 * value of the closest match in our list, or `null` if no match.
 *
 * Strategy: walk `navigator.languages` (most-preferred first), normalise,
 * and try exact-code → primary-subtag → null.
 *
 * Examples:
 *   ["pt-BR", "en"]  →  "PORTUGUESE_BRAZIL" (exact)
 *   ["pt-PT", "en"]  →  "PORTUGUESE_AFRICA" (pt → pt-002 fallback)
 *   ["zh-HK", "en"]  →  "CHINESE_TRADITIONAL" (zh-hant fallback for zh-*-Hant tags is too clever; we go with first zh-* match which is CHINESE)
 *   ["fa-IR", "en"]  →  "PERSIAN"
 *   ["fr-CA", "en"]  →  "FRENCH" (primary subtag fallback)
 *   ["jp", "en"]     →  null (no Japanese in DW; caller falls back to ENGLISH)
 */
export function detectBrowserLang(): string | null {
  if (typeof navigator === "undefined") return null;
  const langs: string[] = (navigator.languages && navigator.languages.length
    ? Array.from(navigator.languages)
    : [navigator.language || ""]).filter(Boolean);

  for (const raw of langs) {
    const norm = raw.toLowerCase();
    const exact = byCode(norm);
    if (exact) return exact.enum;

    const primary = norm.split("-")[0];
    // Special case Portuguese: any pt-* that isn't pt-br should map to
    // PORTUGUESE_AFRICA (pt-002), not Brazil.
    if (primary === "pt" && norm !== "pt-br") {
      const ptAfrica = byCode("pt-002");
      if (ptAfrica) return ptAfrica.enum;
    }
    const fallback = byCode(primary);
    if (fallback) return fallback.enum;
  }
  return null;
}
