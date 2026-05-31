// One-off: push a fresh post onto watch:posts so the lounge page's
// poll picks it up and exercises the WatchFeed breaking-flash path.
//
// Usage:  node --env-file=.env.local scripts/add-watch-post.mjs "Body text" [https://link.example/]

import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const body = (process.argv[2] ?? "Live test bulletin from the verify pass.").trim();
const link = process.argv[3]?.trim() || null;

const redis = new Redis({ url, token });
const id = randomUUID();
const now = Date.now();
const post = {
  id,
  body,
  link,
  createdAt: now,
  hostEmail: "verify-script@local",
};
await redis.set(`watch:posts:${id}`, JSON.stringify(post));
await redis.zadd("watch:posts", { score: now, member: id });
console.log(`pushed ${id} @ ${new Date(now).toISOString()}`);
