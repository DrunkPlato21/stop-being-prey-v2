// One-shot: append the "Seven days in the workshop" entry to the
// `thomas-massie-problem` Field Note. Posted the afternoon before the
// piece ships. Mirrors the prior seed scripts.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-massie-seven-days-entry.mjs
//
// Idempotency: NOT idempotent.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "thomas-massie-problem";
const TITLE = "Seven days in the workshop";
const ENTRY_DATE_ISO = "2026-05-25";

const BODY = `Seven days in. Late Monday afternoon. I just woke up from a two-hour nap I didn't plan to take. The body collects what the mind has been spending.

Tomorrow morning is the ship. Tuesday. I pushed it from Monday on Sunday night because I needed one more day to land it right. The audience pushed back exactly the way I expected. "Take whatever time you need." So I took it.

What's left of the piece is mostly execution from the bones I've laid. The hardest writing is behind me. The Charlie spine holds the whole thing together in a way I didn't see coming until this weekend. There's a kind of writing where you feel like you're being shown what to write more than you're choosing it. This weekend has been that.

One sentence I sat with for a long time after writing it: "I'm not going to mince words for you. You can handle the hard truths."

That's the contract.

can't wait to show it to you

Still writing.

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
