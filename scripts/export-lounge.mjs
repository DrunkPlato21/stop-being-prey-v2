import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Read-only: dump the entire Lounge (every post + its replies) to a single
// skimmable markdown file so Clay can mine it for testimonial gold. Writes
// NOTHING to Redis. Reads the live (unprefixed) Lounge keyspace, which is
// shared between dev and prod, so this sees the real room.
//
// Posts are sorted newest-first, and each carries its reaction + reply
// counts up top — the built-in "this landed" signal. A "HOT" marker flags
// anything with notable engagement so the strongest candidates jump out.
//
// Usage:  npm run lounge:export   (output: export/lounge-export.md)

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local the same way the other scripts do.
const envPath = join(__dirname, "..", ".env.local");
let env = {};
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  // fall through to process.env
}

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (.env.local).");
  process.exit(1);
}

const redis = new Redis({ url, token });

const POSTS_INDEX = "lounge:posts";
const POST_PREFIX = "lounge:post:";
const REPLY_PREFIX = "lounge:reply:";

const HOT_REACTIONS = 2; // reactions at/above this flag a post as resonant
const HOT_REPLIES = 2;

const fmtDate = (ms) =>
  typeof ms === "number"
    ? new Date(ms).toISOString().slice(0, 16).replace("T", " ")
    : "unknown date";

// Upstash returns already-parsed JSON for object values; guard for strings.
const asObj = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
};

async function main() {
  // Newest-first.
  const postIds = await redis.zrange(POSTS_INDEX, 0, -1, { rev: true });
  if (!postIds || postIds.length === 0) {
    console.log("Lounge is empty (no posts in lounge:posts).");
    return;
  }

  const lines = [];
  lines.push("# Lounge export");
  lines.push("");
  lines.push(`Pulled ${postIds.length} post(s), newest first. Generated read-only.`);
  lines.push("Scan the HOT-flagged posts first: those drew reactions or replies.");
  lines.push("");

  let postCount = 0;
  let replyTotal = 0;
  let hotCount = 0;

  for (const postId of postIds) {
    const post = asObj(await redis.get(`${POST_PREFIX}${postId}`));
    if (!post) continue;
    if (post.deleted) continue;
    postCount++;

    const reactions = post.reactionCount ?? 0;
    const replies = post.replyCount ?? 0;
    const hot = reactions >= HOT_REACTIONS || replies >= HOT_REPLIES;
    if (hot) hotCount++;

    const badge = post.isFounder ? " (founder)" : "";
    const hotTag = hot ? "  ⭐ HOT" : "";
    lines.push("---");
    lines.push("");
    lines.push(
      `### ${post.firstName || "A member"}${badge} · ${fmtDate(post.createdAt)} · ${reactions} reactions · ${replies} replies${hotTag}`
    );
    lines.push("");
    lines.push((post.body || "").trim() || "_(no text)_");
    lines.push("");

    // Replies, oldest-first so the thread reads in order.
    const replyIds = await redis.zrange(
      `${POST_PREFIX}${postId}:replies`,
      0,
      -1
    );
    for (const replyId of replyIds || []) {
      const reply = asObj(await redis.get(`${REPLY_PREFIX}${replyId}`));
      if (!reply || reply.deleted) continue;
      replyTotal++;
      const rBadge = reply.isFounder ? " (founder)" : "";
      lines.push(
        `> **${reply.firstName || "A member"}${rBadge}** · ${fmtDate(reply.createdAt)} · ${reply.reactionCount ?? 0} reactions`
      );
      for (const l of (reply.body || "").trim().split("\n")) {
        lines.push(`> ${l}`);
      }
      lines.push("");
    }
  }

  lines.unshift("");
  lines.unshift(
    `> ${postCount} posts · ${replyTotal} replies · ${hotCount} flagged HOT`
  );

  const outDir = join(__dirname, "..", "export");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "lounge-export.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(
    `Wrote ${outPath}\n${postCount} posts, ${replyTotal} replies, ${hotCount} HOT.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
