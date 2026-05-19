// One-shot: append the first diary entry to the
// `thomas-massie-problem` Field Note. Mirrors what
// `appendEntry()` in src/lib/field-notes.ts does at the
// /admin/field-notes/[slug] form, but pre-fills the body Clay
// already wrote so he doesn't have to retype it.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-thomas-massie-entry.mjs
//
// Idempotency: NOT idempotent. Each run appends a new entry. After
// this works once, delete the script or the duplicate entry will
// show up. Easiest cleanup: open /admin/field-notes/thomas-massie-problem
// and click "delete" on the dupe.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "thomas-massie-problem";
const TITLE = "the sequel to Losertarian";
const ENTRY_DATE_ISO = "2026-05-19";

const BODY = `A few days ago I was writing a climate change piece… "Al Gore is a Mass Murderer" I called it… It was going good for a while, I was feeling it, getting some good stuff down… but then I started getting a sinking feeling… I kept sensing that I was trying to do something a lot of people have already done.

I was writing something that was pretty good… but it wasn't that unique. It's not really needed right now…

As I was going through this… the Thomas Massie story kept heating up. People fighting about it in my comments, and emailing me trying to get me to write about it… I kept watching… I kept seeing the libertarians engage in their typical losertarian behavior... and I realized something… what we're witnessing is the sequel to my Losertarian piece. It's playing out in real time, right in front of us.

I'm struggling with a serious contradiction… I like Massie… I agree with him on policy almost entirely, if you were to go line by line... but I completely disagree with him on strategy right now… I think he's helping the enemy.

And now some of my former heroes in the libertarian movement, are people I can't help but cringe at when i see them 'operate'. It's bad.

I've never been more certain that libertarians have no idea how the game is played… I feel second-hand embarrassment watching them try.

They're just emoting publicly… purity signaling. There is zero political strategy here... outside of a few critical operators like Angela McArdle. The rare exception.

So Gore got shelved… I'm writing this instead.

stay close.`;

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
