// Backfill Lounge post/reply author names to the member's FULL display
// name. Historically the Lounge stored only the first word of the display
// name on each post/reply (a `firstName` field, denormalized at write
// time). We now show the whole display name everywhere, so this rewrites
// the stored value on existing records to match.
//
// The stored field is still named `firstName` (legacy). We set it to the
// member's current profile display name, capped at 30 chars, exactly like
// createPost/createReply do for new records.
//
// Safe to run repeatedly: idempotent (only writes records whose stored
// name actually differs). DRY-RUN by default — pass --apply to write.
//
//   Dry run:  node --env-file=.env.local scripts/backfill-lounge-names.mjs
//   Apply:    node --env-file=.env.local scripts/backfill-lounge-names.mjs --apply
//
// NOTE: local dev shares the LIVE Upstash Redis, and Lounge keys are
// unprefixed, so this operates on PRODUCTION lounge data. That's the
// intent (it fixes real posts). Run the dry run first and read the diff.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const APPLY = process.argv.includes("--apply");

const POSTS_INDEX = "lounge:posts";
const POST_PREFIX = "lounge:post:";
const REPLY_PREFIX = "lounge:reply:";
const REPLIES_SUFFIX = ":replies";
const PROFILE_PREFIX = "profile:";
const MAX_NAME = 30;

function parse(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function localPart(email) {
  return normEmail(email).split("@")[0] || "Member";
}

// Mirror of the app's name rule: full display name, else the email
// local-part, capped at 30 chars.
function fullNameFor(email, displayName) {
  const dn = String(displayName || "").trim();
  const base = dn.length > 0 ? dn : localPart(email);
  return base.slice(0, MAX_NAME);
}

async function chunkedMget(keys, size = 100) {
  const out = new Map();
  for (let i = 0; i < keys.length; i += size) {
    const slice = keys.slice(i, i + size);
    const vals = slice.length ? await redis.mget(...slice) : [];
    slice.forEach((k, idx) => out.set(k, vals[idx]));
  }
  return out;
}

async function main() {
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY RUN (no writes)\n");

  // 1. Collect every post + reply record.
  const postIds = (await redis.zrange(POSTS_INDEX, 0, -1)) ?? [];
  console.log(`Posts in index: ${postIds.length}`);

  const records = []; // { key, obj }
  for (const pid of postIds) {
    const post = parse(await redis.get(`${POST_PREFIX}${pid}`));
    if (post) records.push({ key: `${POST_PREFIX}${pid}`, obj: post });

    const replyIds =
      (await redis.zrange(`${POST_PREFIX}${pid}${REPLIES_SUFFIX}`, 0, -1)) ?? [];
    for (const rid of replyIds) {
      const reply = parse(await redis.get(`${REPLY_PREFIX}${rid}`));
      if (reply) records.push({ key: `${REPLY_PREFIX}${rid}`, obj: reply });
    }
  }
  console.log(`Records loaded (posts + replies): ${records.length}`);

  // 2. Resolve current display names for every distinct author.
  const emails = [...new Set(records.map((r) => normEmail(r.obj.memberEmail)))];
  const profileKeys = emails.map((e) => `${PROFILE_PREFIX}${e}`);
  const profileMap = await chunkedMget(profileKeys);
  const nameByEmail = new Map();
  for (const email of emails) {
    const profile = parse(profileMap.get(`${PROFILE_PREFIX}${email}`));
    nameByEmail.set(email, fullNameFor(email, profile?.displayName));
  }

  // 3. Compute + apply changes.
  let changed = 0;
  let unchanged = 0;
  const sample = [];
  for (const rec of records) {
    const email = normEmail(rec.obj.memberEmail);
    const newName = nameByEmail.get(email) ?? fullNameFor(email, null);
    const oldName = rec.obj.firstName ?? "";
    if (oldName === newName) {
      unchanged++;
      continue;
    }
    changed++;
    if (sample.length < 40) sample.push(`  "${oldName}"  ->  "${newName}"   (${email})`);
    if (APPLY) {
      rec.obj.firstName = newName;
      await redis.set(rec.key, JSON.stringify(rec.obj));
    }
  }

  console.log(`\nChanged:   ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  if (sample.length) {
    console.log(`\n${APPLY ? "Applied" : "Would change"} (first ${sample.length}):`);
    console.log(sample.join("\n"));
  }
  console.log(
    APPLY
      ? "\nDone. Re-run without --apply to confirm 0 remaining changes."
      : "\nDry run only. Re-run with --apply to write these changes."
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
