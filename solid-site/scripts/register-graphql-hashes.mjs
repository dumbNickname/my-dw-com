/**
 * Pre-registers our two GraphQL queries with webapi.dw.com so the runtime
 * client can use cacheable GET requests with sha256 hashes from the very
 * first user request.
 *
 * Writes src/data/query-hashes.json with the registered hashes + the
 * original query text (kept as a fallback if the server later evicts the
 * registration).
 *
 * Runs in CI before `pnpm build`, and locally before first dev session.
 *
 * Mirrors the pattern in workshop/dw_libs/metadata/task.py.
 */
import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const ENDPOINT = "https://webapi.dw.com/graphql";

const QUERIES = {
  MyDwCard: `query MyDwCard($id: Int!, $lang: Language!) {
  content(id: $id, lang: $lang) {
    ... on ModelAspect { id modelType language }
    ... on NamedAspect { title }
    ... on TeaserAspect { roadTeaserKicker }
    ... on TextualAspect { shortTeaser teaser }
    ... on DeliveryAspect { contentDate }
    ... on AssociationsAspect {
      categories { name originId }
      regions { name originId }
      mainContentImage { staticUrl }
    }
    ... on UrlAspect { namedUrl }
    ... on PlaybackResourceAspect { formattedDurationInMinutes duration }
    ... on Video { hlsVideoSrc }
    ... on Audio { mp3Src }
  }
}`,
  MyDwBody: `query MyDwBody($id: Int!, $lang: Language!) {
  content(id: $id, lang: $lang) {
    ... on ModelAspect { id }
    ... on TextualAspect { text }
  }
}`,
};

// A known-good content_id for registration. The server only needs to see
// any well-formed variables to accept the registration.
const SAMPLE_VARS = { id: 77527661, lang: "ENGLISH" };

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const out = {};
for (const [name, query] of Object.entries(QUERIES)) {
  const hash = sha256(query);
  const body = {
    query,
    variables: SAMPLE_VARS,
    extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apollo-require-preflight": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Register ${name} failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors?.some((e) => e.message === "PersistedQueryNotFound")) {
    throw new Error(`Server did not register ${name}: ${JSON.stringify(json.errors)}`);
  }
  if (json.errors?.length) {
    // Validation errors are OK — the persisted query is registered before validation runs.
    // Surface for visibility but do not fail.
    console.warn(`Register ${name} returned non-fatal errors:`, json.errors.map((e) => e.message).join("; "));
  }
  console.log(`Registered ${name} -> ${hash}`);
  out[name] = { hash, query };
}

const target = resolve("src", "data", "query-hashes.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${target}`);
