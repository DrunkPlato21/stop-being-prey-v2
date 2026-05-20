// One-shot: overwrite the body of the "diagnosis to verdict" entry on
// the thomas-massie-problem Field Note to fix the math (two readers +
// one commentator, not three + one). Idempotent — re-running just
// rewrites the same key with the same content.
//
// Usage:  node --env-file=.env.local scripts/update-massie-verdict-entry.mjs

import { Redis } from "@upstash/redis";

const ENTRY_ID = "aa9a1d06-b0d6-4dc6-ab6e-5ad85575476a";

const BODY = `I've been writing The Thomas Massie Problem for a few days now, non-stop... Six acts, structurally complete by Sunday... I had the diagnosis, I had the frame and I had the receipts… the piece was ready to ship Wednesday or Thursday…

Then yesterday happened.

Massie lost the KY-4 primary... Trump publicly called him "fraudulent" at 3:46 PM... The piece I was writing as a diagnosis became, in the span of one evening, a verdict.

The opening now has to start last night, not at the Steel Man. The reader walks in already knowing what happened... the piece has to explain WHY.

What's been remarkable is the convergence happening in real time. Two readers and one commentator have arrived at the same diagnosis from different angles. Lonnie wrote me "he needs to pick his battles better." Max wrote "it's like they don't want to win." Julie Borowski, a long-time libertarian and Massie supporter, posted today: "he can monetize that as a political commentator."

Triangulation like that is how you know a frame is real.

Still writing… more soon.

More soon.

stay close,
Clay`;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}

const redis = new Redis({ url, token });
const raw = await redis.get(`fn:entry:${ENTRY_ID}`);
if (!raw) {
  console.error(`Entry fn:entry:${ENTRY_ID} not found.`);
  process.exit(1);
}
const existing = typeof raw === "string" ? JSON.parse(raw) : raw;
const next = { ...existing, body: BODY };
await redis.set(`fn:entry:${ENTRY_ID}`, JSON.stringify(next));
console.log(`Updated body of ${ENTRY_ID} ("${next.title}").`);
