// One-shot: append the "shelving this for a bit" entry to the
// `al-gore-is-a-mass-murderer` Field Note. Mirrors the
// thomas-massie seed script in shape.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/seed-al-gore-shelving-entry.mjs
//
// Idempotency: NOT idempotent. Each run appends a new entry.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const SLUG = "al-gore-is-a-mass-murderer";
const TITLE = "shelving this for a bit";
const ENTRY_DATE_ISO = "2026-05-19";

const BODY = `Setting this one down for now.

The Thomas Massie story heated up and what's happening over there is the sequel to Losertarian, playing out live… that piece needed to be made first. So I made it.

More on the why in the Massie Field Note.

I'll come back to this. The bones are good and the argument is still right. Just not the piece that needs to be made right now.

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
