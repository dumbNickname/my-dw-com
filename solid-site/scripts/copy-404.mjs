/**
 * Copies the SPA's `index.html` to `404.html` so GitHub Pages serves the
 * same shell on unknown paths. The client router then resolves the path
 * (catch-all under src/routes/[...404].tsx redirects to /).
 *
 * GH Pages serves only a top-level `404.html` — it does not look in
 * subdirectories — which is why this step exists.
 */
import { copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), ".output", "public");

// Prefer a prerendered /404/index.html if present (would happen if vinxi
// extended its prerender to catch-all routes). Otherwise, fall back to
// duplicating index.html — that is the standard SPA-on-GH-Pages pattern.
const candidates = [
  resolve(root, "404", "index.html"),
  resolve(root, "index.html"),
];

for (const src of candidates) {
  try {
    await access(src);
    const dst = resolve(root, "404.html");
    await copyFile(src, dst);
    console.log(`Wrote 404.html from ${src.replace(root, ".output/public")}`);
    process.exit(0);
  } catch {
    // try next candidate
  }
}

console.warn("Could not find a source for 404.html — direct hits to deep links may 404 on GH Pages.");
