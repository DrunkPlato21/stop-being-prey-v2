// READ-ONLY export of all member-generated content (lounge posts +
// replies, article comments + thread replies) into one markdown file
// for testimonial mining. Mirrors the Redis schema documented in
// src/lib/lounge.ts and src/lib/comments.ts.
//
// Redis commands used: ZRANGE, MGET. Nothing else. No writes, ever.
// Output: export/member-content-export.md (the only file touched).
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/export-member-content.mjs

import { Redis } from "@upstash/redis";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

// Upstash auto-deserializes JSON values sometimes; handle both shapes,
// same as parsePost/parseReply/getComment do in the libs.
function parseJson(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// MGET in chunks so a long key list never overflows a single request.
async function mgetChunked(keys, chunkSize = 100) {
  const out = [];
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const raw = (await redis.mget(...chunk)) ?? [];
    out.push(...raw);
  }
  return out;
}

function formatDate(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "unknown date";
  return new Date(ms).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
}

function quoteBlock(body) {
  return String(body ?? "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function entry({ name, email, at, body, suffix = "", indent = "" }) {
  const head = `${indent}**${name}** (${email}) — ${formatDate(at)}${suffix}:`;
  const quoted = quoteBlock(body)
    .split("\n")
    .map((l) => indent + l)
    .join("\n");
  return `${head}\n${quoted}`;
}

/* === Display names (profile:<email>) ======================== */

async function resolveDisplayNames(emails) {
  const unique = Array.from(
    new Set(emails.map((e) => String(e).toLowerCase().trim()).filter(Boolean))
  );
  const names = new Map();
  if (unique.length === 0) return names;
  const raw = await mgetChunked(unique.map((e) => `profile:${e}`));
  unique.forEach((email, i) => {
    const profile = parseJson(raw[i]);
    const dn = profile?.displayName?.trim();
    if (dn) names.set(email, dn);
  });
  return names;
}

function nameFor(names, email, fallback) {
  const norm = String(email ?? "").toLowerCase().trim();
  return (
    names.get(norm) ||
    (fallback && String(fallback).trim()) ||
    norm.split("@")[0] ||
    "Member"
  );
}

/* === Lounge ================================================== */

async function exportLounge() {
  // Full visible history: every id in the lounge:posts index. Soft-
  // deleted posts are removed from this index by design (the records
  // remain only for the moderation audit trail), so they're excluded.
  const ids = (await redis.zrange("lounge:posts", 0, -1)) ?? [];
  const postIds = ids.filter((v) => typeof v === "string");
  const rawPosts = postIds.length
    ? await mgetChunked(postIds.map((id) => `lounge:post:${id}`))
    : [];
  const posts = rawPosts
    .map(parseJson)
    .filter((p) => p && typeof p.id === "string" && !p.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);

  // Replies per post, oldest first, deleted filtered out.
  const repliesByPost = new Map();
  for (const post of posts) {
    const replyIds = (
      (await redis.zrange(`lounge:post:${post.id}:replies`, 0, -1)) ?? []
    ).filter((v) => typeof v === "string");
    if (replyIds.length === 0) {
      repliesByPost.set(post.id, []);
      continue;
    }
    const rawReplies = await mgetChunked(
      replyIds.map((id) => `lounge:reply:${id}`)
    );
    const replies = rawReplies
      .map(parseJson)
      .filter((r) => r && typeof r.id === "string" && !r.deleted)
      .sort((a, b) => a.createdAt - b.createdAt);
    repliesByPost.set(post.id, replies);
  }

  return { posts, repliesByPost };
}

/* === Comments ================================================ */

async function exportComments() {
  // comments:all is the global chrono index of every comment id.
  const ids = ((await redis.zrange("comments:all", 0, -1)) ?? []).filter(
    (v) => typeof v === "string"
  );
  const raw = ids.length
    ? await mgetChunked(ids.map((id) => `comment:${id}`))
    : [];
  const comments = raw
    .map(parseJson)
    .filter((c) => c && typeof c.id === "string")
    // Paid drafts that were never paid for are invisible everywhere on
    // the site; skip them here too.
    .filter((c) => c.paymentStatus !== "awaiting_payment")
    .sort((a, b) => a.createdAt - b.createdAt);

  // Group by piece, preserving chronological order within each group.
  const groups = new Map();
  for (const c of comments) {
    const key = `${c.kind}:${c.slug}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

/* === Render ================================================== */

const { posts, repliesByPost } = await exportLounge();
const commentGroups = await exportComments();

// One batched name lookup across every author in the export.
const allEmails = [
  ...posts.map((p) => p.memberEmail),
  ...[...repliesByPost.values()].flat().map((r) => r.memberEmail),
  ...[...commentGroups.values()].flat().flatMap((c) => [
    c.email,
    ...(c.threadReplies ?? []).map((r) => r.email),
  ]),
];
const names = await resolveDisplayNames(allEmails);

const lines = [];
lines.push("# Member Content Export");
lines.push("");
lines.push(`Exported ${formatDate(Date.now())} (read-only snapshot).`);
lines.push("");

/* --- Lounge --- */
lines.push("## Lounge");
lines.push("");
let loungeReplyCount = 0;
for (const post of posts) {
  const flags = [];
  if (post.pinned) flags.push("pinned");
  if (post.reactionCount > 0) {
    flags.push(`${post.reactionCount} reaction${post.reactionCount === 1 ? "" : "s"}`);
  }
  const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
  lines.push(
    entry({
      name: nameFor(names, post.memberEmail, post.firstName),
      email: post.memberEmail,
      at: post.createdAt,
      body: post.body,
      suffix,
    })
  );
  const replies = repliesByPost.get(post.id) ?? [];
  for (const reply of replies) {
    loungeReplyCount += 1;
    const rFlags =
      reply.reactionCount > 0
        ? ` [${reply.reactionCount} reaction${reply.reactionCount === 1 ? "" : "s"}]`
        : "";
    lines.push("");
    lines.push(
      entry({
        name: nameFor(names, reply.memberEmail, reply.firstName),
        email: reply.memberEmail,
        at: reply.createdAt,
        body: reply.body,
        suffix: rFlags,
        indent: "  ",
      })
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
}
if (posts.length === 0) {
  lines.push("_No lounge posts found._");
  lines.push("");
}

/* --- Comments --- */
lines.push("## Article Comments");
lines.push("");
let commentCount = 0;
let commentReplyCount = 0;
for (const [key, comments] of commentGroups) {
  lines.push(`### ${key}`);
  lines.push("");
  for (const c of comments) {
    commentCount += 1;
    const flags = [];
    if (c.approved === false) flags.push("pending approval");
    if (c.featured) flags.push("featured");
    if (c.paidComment) flags.push("paid guest");
    const suffix = flags.length ? ` [${flags.join(", ")}]` : "";
    lines.push(
      entry({
        name: nameFor(names, c.email, c.displayName),
        email: c.email,
        at: c.createdAt,
        body: c.body,
        suffix,
      })
    );
    // Clay's author reply lives on the comment record itself.
    if (c.replyBody) {
      commentReplyCount += 1;
      lines.push("");
      lines.push(
        entry({
          name: "Clay (AUTHOR)",
          email: "author reply",
          at: c.replyAt,
          body: c.replyBody,
          indent: "  ",
        })
      );
    }
    for (const r of c.threadReplies ?? []) {
      commentReplyCount += 1;
      lines.push("");
      lines.push(
        entry({
          name: nameFor(names, r.email, r.displayName),
          email: r.email,
          at: r.createdAt,
          body: r.body,
          indent: "  ",
        })
      );
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
}
if (commentGroups.size === 0) {
  lines.push("_No comments found._");
  lines.push("");
}

/* --- Summary --- */
lines.push(
  `**Summary:** ${posts.length} lounge posts, ${loungeReplyCount} lounge replies, ` +
    `${commentCount} comments, ${commentReplyCount} comment replies exported.`
);
lines.push("");

const outDir = path.join(process.cwd(), "export");
const outPath = path.join(outDir, "member-content-export.md");
await mkdir(outDir, { recursive: true });
await writeFile(outPath, lines.join("\n"), "utf8");

console.log(`Wrote ${outPath}`);
console.log(
  `  ${posts.length} lounge posts, ${loungeReplyCount} lounge replies, ` +
    `${commentCount} comments, ${commentReplyCount} comment replies.`
);
