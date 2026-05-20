// One-shot: append a new entry to the `thomas-massie-problem` Field
// Note for the day Massie lost the KY-4 primary and the piece's frame
// shifted from diagnosis to verdict. Mirrors the prior seed scripts.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-massie-verdict-entry.mjs
//
// Idempotency: NOT idempotent.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "thomas-massie-problem";
const TITLE = "diagnosis to verdict";
const ENTRY_DATE_ISO = "2026-05-20";

const BODY = `I've been writing The Thomas Massie Problem for a few days now, non-stop... Six acts, structurally complete by Sunday... I had the diagnosis, I had the frame and I had the receipts… the piece was ready to ship Wednesday or Thursday…

Then yesterday happened.

Massie lost the KY-4 primary... Trump publicly called him "fraudulent" at 3:46 PM... The piece I was writing as a diagnosis became, in the span of one evening, a verdict.

The opening now has to start last night, not at the Steel Man. The reader walks in already knowing what happened... the piece has to explain WHY.

What's been remarkable is the convergence happening in real time. Three readers and one libertarian commentator have arrived at the same diagnosis from different angles. Lonnie wrote me "he needs to pick his battles better." Max wrote "it's like they don't want to win." Julie Borowski, a long-time libertarian and Massie supporter, posted today: "he can monetize that as a political commentator."

Triangulation like that is how you know a frame is real.

Still writing… more soon.

More soon.

stay close,
Clay`;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

const date = Date.parse(`${ENTRY_DATE_ISO}T00:00:00Z`);
if (!Number.isFinite(date)) {
  console.error(`Could not parse ENTRY_DATE_ISO=${ENTRY_DATE_ISO}`);
  process.exit(1);
}

const id = randomUUID();
const now = Date.now();
const entry = {
  id,
  slug: SLUG,
  date,
  title: TITLE,
  body: BODY,
  createdAt: now,
};

await redis.set(`fn:entry:${id}`, JSON.stringify(entry));
await redis.zadd(`fn:entries:${SLUG}`, { score: date, member: id });

console.log(`Appended entry "${TITLE}" to ${SLUG}`);
console.log(`  id: ${id}`);
console.log(`  date: ${new Date(date).toISOString()}`);
console.log(`\nView at /notes/field-notes/${SLUG}`);
console.log(`Manage at /admin/field-notes/${SLUG}`);
