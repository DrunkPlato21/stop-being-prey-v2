// Nuke the lounge. Scans Upstash for every key under the `lounge:*`
// namespace (posts, replies, reactions, the pinned slot, moderation
// log, rate limits, read-by-clay sets, last-viewed stamps, active-now
// ZSET, authors set, everything) and deletes them on --execute.
//
// Used to wipe pre-launch test chatter so members landing on launch
// day see an empty room.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/clear-lounge.mjs            # inspect
//   node --env-file=.env.local scripts/clear-lounge.mjs --execute  # nuke
//
// Safe to run repeatedly. Idempotent on already-empty state.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });
const execute = process.argv.includes("--execute");

async function scanAll(pattern) {
  const out = [];
  let cursor = "0";
  do {
    const res = await redis.scan(cursor, { match: pattern, count: 200 });
    cursor = res[0];
    const keys = res[1];
    for (const k of keys) out.push(k);
  } while (cursor !== "0" && cursor !== 0);
  return out;
}

function summarize(keys) {
  // Group by prefix so the inspect output is readable instead of a
  // 200-line dump of raw keys.
  const buckets = new Map();
  for (const k of keys) {
    // Bucket on the segment after "lounge:". For nested keys like
    // "lounge:post:<id>:replies", the bucket is "post:*:replies".
    const tail = k.startsWith("lounge:") ? k.slice("lounge:".length) : k;
    const parts = tail.split(":");
    let bucket;
    if (parts.length === 1) {
      bucket = parts[0];
    } else if (parts.length === 2) {
      bucket = `${parts[0]}:*`;
    } else {
      bucket = `${parts[0]}:*:${parts.slice(2).join(":")}`;
    }
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  for (const [bucket, count] of sorted) {
    console.log(`  ${String(count).padStart(4)} × lounge:${bucket}`);
  }
}

async function main() {
  console.log(
    `Mode: ${execute ? "EXECUTE (will delete keys)" : "READ-ONLY inspect"}`
  );
  console.log("");

  const keys = await scanAll("lounge:*");
  console.log(`Found ${keys.length} key(s) under lounge:*`);
  if (keys.length > 0) {
    summarize(keys);
  }
  console.log("");

  if (!execute) {
    console.log(
      "(read-only mode — no changes made. Re-run with --execute to clear.)"
    );
    return;
  }

  if (keys.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // DEL in batches of 100 to keep request bodies sane.
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await redis.del(...batch);
    deleted += batch.length;
    console.log(`  deleted ${deleted} / ${keys.length}`);
  }

  console.log("");
  console.log("Verifying...");
  const remaining = await scanAll("lounge:*");
  console.log(`lounge:* keys remaining: ${remaining.length}`);
  if (remaining.length > 0) {
    console.log("(unexpected; first 10):");
    for (const k of remaining.slice(0, 10)) console.log(`  ${k}`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
