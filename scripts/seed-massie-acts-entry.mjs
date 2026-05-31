// One-shot: append the "Acts 1 Through 5" entry to the
// `thomas-massie-problem` Field Note. Posted the night the early-access
// piece ships to members. Mirrors the prior seed scripts.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-massie-acts-entry.mjs
//
// Idempotency: NOT idempotent.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "thomas-massie-problem";
const TITLE = "Acts 1 Through 5";
const ENTRY_DATE_ISO = "2026-05-27";

const BODY = `This thing is going out to members tonight.

Acts 1 through 5. Roughly 10,000 words. The longest thing I've ever written.

Act 6 isn't done. I'm still writing it. Members are getting the cliffhanger.

I thought about waiting for the whole thing. Decided I'd rather let the people who pay to support this work read it in progress, send me feedback, and watch me finish live than wait another few days for the public version.

You're paying for early access. This IS early access. The disclaimer at the top of the piece tells you exactly what you're getting... rough draft, updating live throughout the day, feedback welcome, compliments needed too.

Honest update on what writing this piece has been like... I have been put through every costume the inner critic wears. Fraud panic. Late-night spirals where I was convinced I'd never been a real writer. Mornings where I couldn't open the file. Evenings where I cried at what I'd written.

Yesterday morning I ran a different essay through one of those text-analysis tools and the score came back ugly. I spent the next six hours convinced everything I'd written was garbage.

Last night I ran this one. 100 percent human. High confidence.

Different costume. Same fear. It doesn't quit at the finish line. It gets louder.

The piece will go public later this week. Members get it first because that's what you paid for. You'll see typos. You'll see beats I'm still tightening. You'll watch me finish Act 6 in real time.

If you spot something off, send it. If you just want to tell me it landed, I'll take that too. Honestly, I need it.

Been through hell on this one.

~ Clay`;

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
