// One-shot: append a new entry to the `thomas-massie-problem` Field
// Note for the weekend the piece's frame, voice, and close all broke
// open. Mirrors the prior seed scripts.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-massie-workshop-entry.mjs
//
// Idempotency: NOT idempotent.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "thomas-massie-problem";
const TITLE = "Five days in the workshop";
const ENTRY_DATE_ISO = "2026-05-23";

const BODY = `Five days into writing the Massie piece. It's the longest thing I've ever made. 10,000+ words. Six acts. Three libertarian leaders named by name.

This weekend has been the breakthrough. A few things broke open.

The frame. I had been circling the structural diagnosis for months without a name. This week it crystallized. Regime Alliance vs MAGA Alliance. Two camps. Power tells you who its allies are by who it doesn't attack. The libertarian commentariat is the right flank of the Regime Alliance whether they know it or not. That single sentence does more diagnostic work than any prior piece I've written.

The voice. I read Act 4 back to myself and the argument was airtight but the prose was inert. The kind of writing where every sentence is correct and none of them feel like me. I forced myself to rewrite the whole second half. The pet metaphor system that runs through the act now came out of that rewrite. Libertarians as foot soldiers, paid with treats and pats on the head. Perfect pets. Visible. Vocal. Domesticated... neutered. The discipline of refusing to ship the version that almost works is what produced the version that does.

The close. Almost the entire Act 6 close came out in one rant after midnight. The direct address to Dave and Clint. The "you're in my domain now" frame flip. The fatherhood landing. The "Charlie's dead. Start getting serious." kill line. The four-part question. Are you a serious person or are you a joker? Are you in the business of libertarianism or do you actually want to win?

The exit voice. Found it by accident at four in the morning. "If you care about the libertarian movement, and I don't, but if you did, you should want these guys deposed as leaders." That's the close of the piece in one sentence. The voice of someone who walked out without being bitter. Tomorrow I write it long.

On Monday, It ships.`;

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
