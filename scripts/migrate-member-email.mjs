// One-off migration: rewrite every store that keys on or embeds a
// member's email so a single member's data moves from <FROM> to <TO>.
//
// Use when a member signed up with the wrong email and we need to swap
// it without losing their tier / founder slot / comments / lounge
// activity / notes / case submissions / notifications.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/migrate-member-email.mjs \
//        --from old@example.com --to new@example.com
//
//   # then, after eyeballing the plan:
//   node --env-file=.env.local scripts/migrate-member-email.mjs \
//        --from old@example.com --to new@example.com --commit
//
// Without --commit the script reads only and prints the plan. With
// --commit it executes the same plan against Upstash. Re-running on
// already-migrated data is a no-op (the FROM keys won't exist).
//
// What it touches (Upstash Redis only; no SQLite in this repo):
//
//   Key renames           member:<email>, profile:<email>,
//                         notes:by-member:<email>,
//                         case-submissions:by-email:<email>,
//                         notifications:member:<email>,
//                         notifications:unread:<email>,
//                         desk:last-visited:<email>,
//                         lounge:lastviewed:<email>,
//                         lounge:rate:posts:<email>,
//                         lounge:rate:replies:<email>,
//                         member-comments:<email>,
//                         member-comment:<email>:<kind>:<slug>
//
//   Index membership      members:all, lounge:authors,
//                         lounge:active-now, profiles:flagged
//
//   String value rewrite  member:by-customer:<id>,
//                         member:by-session:<id>,
//                         displayname:taken:<normalized>
//
//   Embedded email field  every comment authored by FROM
//                         (member-comments:<FROM>), every thread reply
//                         by FROM across all comments, every lounge
//                         post + reply, every note, every case
//                         submission, every notification, every lounge
//                         reactions hash (post + reply).
//
//   Stripe customer      customer.email field via stripe.customers
//                         .update(). Required so /api/auth/request-link
//                         (which looks the member up in Stripe before
//                         minting a magic link) can find them at the
//                         new address. Only runs when STRIPE_SECRET_KEY
//                         is set in env — without it the script warns
//                         and leaves Stripe alone.
//
// Caveats:
//   - JWT session cookie still encodes the old email; the member must
//     request a fresh magic link after the swap to get a session bound
//     to the new email.
//   - Pre-existing magic-link records (15-min TTL) are not migrated.
//     They'll expire on their own.
//   - Profile audit log (displayNameHistory) is preserved as-is. Its
//     entries don't store emails.
//   - Stripe key in .env.local is usually a test key. To migrate a
//     real customer you need the live key (sk_live_…) in env when you
//     run --commit. If the test key is loaded the script will try to
//     update a test-mode customer that doesn't exist and quietly skip;
//     the loud "STRIPE_SECRET_KEY not set" path doesn't trigger. Fix
//     the prod Stripe record in the dashboard if you're not sure
//     which key is loaded.

import { Redis } from "@upstash/redis";
import Stripe from "stripe";

// ---- args + env ----------------------------------------------------

const argv = process.argv.slice(2);

function readFlag(name) {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

const FROM_RAW = readFlag("from");
const TO_RAW = readFlag("to");
const COMMIT = argv.includes("--commit");

if (!FROM_RAW || !TO_RAW) {
  console.error("Usage: --from <old-email> --to <new-email> [--commit]");
  process.exit(2);
}

// Stores normalize via toLowerCase().trim() before keying — match that
// exactly so we hit the same records the app does.
const FROM = FROM_RAW.toLowerCase().trim();
const TO = TO_RAW.toLowerCase().trim();

if (FROM === TO) {
  console.error("FROM and TO normalize to the same email; nothing to do.");
  process.exit(2);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

// Stripe is optional — without it, the script still migrates every
// Upstash store but warns that the customer's Stripe email is now
// out of sync with the rest of the system, which breaks email-based
// lookups like the magic-link sign-in flow. Use a test key to dry-run
// against test Stripe; the prod key (sk_live_…) to actually fix a
// real member.
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    })
  : null;

// ---- output helpers ------------------------------------------------

const mode = COMMIT ? "COMMIT" : "DRY-RUN";
const tag = COMMIT ? "DID " : "WILL";

function header(title) {
  console.log("");
  console.log(`── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

function row(action, detail) {
  console.log(`  ${tag} ${action.padEnd(18)} ${detail}`);
}

function note(text) {
  console.log(`  ${text}`);
}

// ---- counters ------------------------------------------------------

const counts = {
  keysRenamed: 0,
  stringsRewritten: 0,
  setMembershipsMoved: 0,
  zsetMembershipsMoved: 0,
  commentsRewritten: 0,
  threadRepliesRewritten: 0,
  loungePostsRewritten: 0,
  loungeRepliesRewritten: 0,
  loungeReactionsMoved: 0,
  notesRewritten: 0,
  caseSubmissionsRewritten: 0,
  notificationsRewritten: 0,
  stripeCustomersUpdated: 0,
};

// ---- primitive ops -------------------------------------------------

// Rename a key by copying its value to the new key and deleting the
// old one. Works regardless of whether the value is a string or JSON
// (Upstash's get returns parsed JSON when applicable; we round-trip
// the same shape on the write side).
async function renameKey(srcKey, dstKey) {
  const exists = await redis.exists(srcKey);
  if (!exists) return false;
  row("rename key", `${srcKey} → ${dstKey}`);
  if (!COMMIT) {
    counts.keysRenamed++;
    return true;
  }
  // Use the Redis RENAME command directly — atomic, preserves TTL,
  // and handles whichever data type the key holds. NX guard avoids
  // clobbering a TO key that already exists (we pre-flight against
  // this, but belt-and-braces).
  const ok = await redis.renamenx(srcKey, dstKey);
  if (!ok) {
    console.error(`  ! rename refused; ${dstKey} already exists`);
    return false;
  }
  counts.keysRenamed++;
  return true;
}

// Rewrite a key whose value is a single string. Only writes when the
// current value matches `expectedOld`.
async function rewriteString(key, expectedOld, newValue) {
  const current = await redis.get(key);
  if (current === null || current === undefined) return false;
  if (current !== expectedOld) return false;
  row("rewrite string", `${key}: ${expectedOld} → ${newValue}`);
  if (!COMMIT) {
    counts.stringsRewritten++;
    return true;
  }
  await redis.set(key, newValue);
  counts.stringsRewritten++;
  return true;
}

// Move a member entry from one value to another inside a SET (no
// score). If FROM isn't a member, this is a no-op.
async function moveSetMember(setKey, fromMember, toMember) {
  const isMember = await redis.sismember(setKey, fromMember);
  if (!isMember) return false;
  row("move set member", `${setKey}: ${fromMember} → ${toMember}`);
  if (!COMMIT) {
    counts.setMembershipsMoved++;
    return true;
  }
  await redis.srem(setKey, fromMember);
  await redis.sadd(setKey, toMember);
  counts.setMembershipsMoved++;
  return true;
}

// Move a member entry inside a ZSET, preserving its score so ordering
// stays intact.
async function moveZsetMember(zsetKey, fromMember, toMember) {
  const score = await redis.zscore(zsetKey, fromMember);
  if (score === null || score === undefined) return false;
  row(
    "move zset member",
    `${zsetKey}: ${fromMember} → ${toMember} (score ${score})`
  );
  if (!COMMIT) {
    counts.zsetMembershipsMoved++;
    return true;
  }
  await redis.zrem(zsetKey, fromMember);
  await redis.zadd(zsetKey, { score: Number(score), member: toMember });
  counts.zsetMembershipsMoved++;
  return true;
}

// Move a field inside a HASH from one field name to another.
async function moveHashField(hashKey, fromField, toField) {
  const value = await redis.hget(hashKey, fromField);
  if (value === null || value === undefined) return false;
  row(
    "move hash field",
    `${hashKey}: ${fromField} → ${toField}`
  );
  if (!COMMIT) {
    counts.loungeReactionsMoved++;
    return true;
  }
  await redis.hset(hashKey, { [toField]: value });
  await redis.hdel(hashKey, fromField);
  counts.loungeReactionsMoved++;
  return true;
}

// Rewrite a JSON record by reading, mutating, and writing back. The
// mutator returns true if it changed anything; we only write when so.
async function rewriteJson(key, mutate) {
  const record = await redis.get(key);
  if (!record || typeof record !== "object") return false;
  const before = JSON.stringify(record);
  const changed = mutate(record);
  if (!changed) return false;
  const after = JSON.stringify(record);
  if (after === before) return false;
  row("rewrite json", key);
  if (!COMMIT) return true;
  await redis.set(key, record);
  return true;
}

// ---- pattern helpers -----------------------------------------------

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

// ---- pre-flight ----------------------------------------------------

async function preflight() {
  header(`Pre-flight  (mode = ${mode})`);
  note(`FROM: ${FROM}`);
  note(`TO:   ${TO}`);

  const [fromMember, fromProfile, toMember, toProfile] = await Promise.all([
    redis.exists(`member:${FROM}`),
    redis.exists(`profile:${FROM}`),
    redis.exists(`member:${TO}`),
    redis.exists(`profile:${TO}`),
  ]);

  note(
    `FROM member record: ${fromMember ? "exists" : "MISSING"} · ` +
      `profile: ${fromProfile ? "exists" : "MISSING"}`
  );
  note(
    `TO   member record: ${toMember ? "EXISTS (conflict)" : "absent"} · ` +
      `profile: ${toProfile ? "EXISTS (conflict)" : "absent"}`
  );

  if (!fromMember && !fromProfile) {
    console.error(
      "Nothing to migrate — neither member:<FROM> nor profile:<FROM> exists."
    );
    process.exit(1);
  }
  if (toMember || toProfile) {
    console.error(
      "Refusing to migrate: TO email already has a member or profile " +
        "record. Resolve the conflict (merge or pick a different TO) " +
        "before running this script."
    );
    process.exit(1);
  }
}

// ---- migration phases ---------------------------------------------

async function migrateSimpleKeyRenames() {
  header("Email-keyed records");
  const renames = [
    [`member:${FROM}`, `member:${TO}`],
    [`profile:${FROM}`, `profile:${TO}`],
    [`notes:by-member:${FROM}`, `notes:by-member:${TO}`],
    [`case-submissions:by-email:${FROM}`, `case-submissions:by-email:${TO}`],
    [`notifications:member:${FROM}`, `notifications:member:${TO}`],
    [`notifications:unread:${FROM}`, `notifications:unread:${TO}`],
    [`desk:last-visited:${FROM}`, `desk:last-visited:${TO}`],
    [`lounge:lastviewed:${FROM}`, `lounge:lastviewed:${TO}`],
    [`lounge:rate:posts:${FROM}`, `lounge:rate:posts:${TO}`],
    [`lounge:rate:replies:${FROM}`, `lounge:rate:replies:${TO}`],
    [`member-comments:${FROM}`, `member-comments:${TO}`],
  ];
  for (const [src, dst] of renames) {
    await renameKey(src, dst);
  }

  // member-comment:<email>:<kind>:<slug> — one key per (kind, slug)
  // the member has commented on. Pattern-match + rename each.
  const commentLockKeys = await scanAll(`member-comment:${FROM}:*`);
  for (const src of commentLockKeys) {
    const suffix = src.slice(`member-comment:${FROM}:`.length);
    const dst = `member-comment:${TO}:${suffix}`;
    await renameKey(src, dst);
  }

  // The member record embeds its own email field; renameKey copies the
  // value verbatim, so the JSON still says FROM after the key moves.
  // Rewrite the embedded field too — code paths like the payment-failed
  // dunning email read member.email directly, so a stale value here re-
  // sends to the bad address. After --commit the record lives at TO; in
  // dry-run it still lives at FROM.
  await rewriteJson(`member:${COMMIT ? TO : FROM}`, (rec) => {
    if (rec.email === FROM) {
      rec.email = TO;
      return true;
    }
    return false;
  });
}

async function migrateIndexMemberships() {
  header("Index memberships (sets and zsets)");
  await moveZsetMember("members:all", FROM, TO);
  await moveSetMember("lounge:authors", FROM, TO);
  await moveZsetMember("lounge:active-now", FROM, TO);
  await moveZsetMember("profiles:flagged", FROM, TO);
}

async function migrateReverseLookups(member) {
  header("Reverse-lookup string values");
  if (!member) {
    note("no member record loaded; skipping reverse-lookup updates");
    return;
  }
  // The record field is stripeCustomerId (not customerId). This reverse
  // index is what every subscription lifecycle webhook resolves through
  // (customerId → email → member record), so if it isn't repointed the
  // migrated member stops syncing on renewal / cancel / plan change.
  if (member.stripeCustomerId) {
    await rewriteString(
      `member:by-customer:${member.stripeCustomerId}`,
      FROM,
      TO
    );
  }
  // There is no sessionId on the member record, so we can't address the
  // by-session idempotency key directly. Scan the (small) by-session
  // keyspace and repoint whichever entry still names FROM — otherwise a
  // Stripe retry of the original checkout could re-process and claim a
  // second founder/charter slot against the deleted old record.
  const sessionKeys = await scanAll("member:by-session:*");
  for (const key of sessionKeys) {
    await rewriteString(key, FROM, TO);
  }
  // displayname:taken:<normalized> → stores the email that claimed
  // the name. We scan + rewrite any key whose value is FROM. Cheaper
  // than a profile lookup since one member usually owns one claim.
  const claimKeys = await scanAll("displayname:taken:*");
  for (const key of claimKeys) {
    await rewriteString(key, FROM, TO);
  }
}

async function migrateAuthoredComments() {
  header("Comments authored by FROM");
  // member-comments:<TO> has already been renamed from FROM (above),
  // so read from TO here. If the rename didn't happen (DRY-RUN), read
  // from FROM.
  const setKey = COMMIT ? `member-comments:${TO}` : `member-comments:${FROM}`;
  const ids = await redis.smembers(setKey);
  if (!ids || ids.length === 0) {
    note("none");
    return;
  }
  for (const id of ids) {
    const changed = await rewriteJson(`comment:${id}`, (rec) => {
      let touched = false;
      if (rec.email === FROM) {
        rec.email = TO;
        touched = true;
      }
      // The author's own thread replies (if any) carry the same email
      // and need rewriting too.
      if (Array.isArray(rec.threadReplies)) {
        for (const reply of rec.threadReplies) {
          if (reply.email === FROM) {
            reply.email = TO;
            touched = true;
          }
        }
      }
      return touched;
    });
    if (changed) counts.commentsRewritten++;
  }
}

async function migrateThreadRepliesElsewhere() {
  header("Thread replies by FROM on other authors' comments");
  // ThreadReplies are embedded — no reverse index. Walk comments:all
  // (a complete index) and rewrite any reply.email === FROM.
  // Comments the member authored have already been handled above;
  // re-visiting them is a no-op because rewriteJson short-circuits
  // when nothing changes.
  const allIds = await redis.zrange("comments:all", 0, -1);
  if (!allIds || allIds.length === 0) {
    note("comments:all is empty");
    return;
  }
  let scanned = 0;
  for (const id of allIds) {
    const changed = await rewriteJson(`comment:${id}`, (rec) => {
      if (!Array.isArray(rec.threadReplies)) return false;
      let touched = false;
      for (const reply of rec.threadReplies) {
        if (reply.email === FROM) {
          reply.email = TO;
          touched = true;
        }
      }
      return touched;
    });
    if (changed) counts.threadRepliesRewritten++;
    scanned++;
  }
  note(`scanned ${scanned} comment record(s)`);
}

async function migrateLoungePostsAndReactions() {
  header("Lounge posts (memberEmail + reactions)");
  const postIds = await redis.zrange("lounge:posts", 0, -1);
  if (!postIds || postIds.length === 0) {
    note("no lounge posts on file");
    return;
  }
  for (const id of postIds) {
    const changed = await rewriteJson(`lounge:post:${id}`, (rec) => {
      if (rec.memberEmail === FROM) {
        rec.memberEmail = TO;
        return true;
      }
      return false;
    });
    if (changed) counts.loungePostsRewritten++;

    // Reactions hash on this post: email → reactionKey. Move the
    // FROM entry to TO if present.
    await moveHashField(`lounge:post:${id}:reactions`, FROM, TO);

    // Replies under this post — iterate even if the post itself is
    // by someone else, since the member may have replied.
    const replyIds = await redis.zrange(`lounge:post:${id}:replies`, 0, -1);
    if (!replyIds || replyIds.length === 0) continue;
    for (const replyId of replyIds) {
      const replyChanged = await rewriteJson(
        `lounge:reply:${replyId}`,
        (rec) => {
          if (rec.memberEmail === FROM) {
            rec.memberEmail = TO;
            return true;
          }
          return false;
        }
      );
      if (replyChanged) counts.loungeRepliesRewritten++;
      await moveHashField(`lounge:reply:${replyId}:reactions`, FROM, TO);
    }
  }
}

async function migrateAuthoredRecordsViaIndex(
  indexKey,
  recordPrefix,
  field,
  counterName,
  label
) {
  header(label);
  // After --commit, the index has been renamed to point at TO. Before
  // commit, it still lives at FROM. Try TO first, fall back to FROM.
  let ids = await redis.zrange(indexKey.replace(FROM, TO), 0, -1);
  if (!ids || ids.length === 0) {
    ids = await redis.zrange(indexKey, 0, -1);
  }
  if (!ids || ids.length === 0) {
    note("none");
    return;
  }
  for (const id of ids) {
    const changed = await rewriteJson(`${recordPrefix}${id}`, (rec) => {
      if (rec[field] === FROM) {
        rec[field] = TO;
        return true;
      }
      return false;
    });
    if (changed) counts[counterName]++;
  }
}

// Update the member's Stripe customer record so the new email is the
// one Stripe knows them by. Without this, emailHasActiveMembership()
// (called inside /api/auth/request-link) can't find them on sign-in
// and the magic-link send silently no-ops.
//
// Two key bits of data needed:
//   - the member's stripeCustomerId, read from the (already-migrated)
//     member record
//   - a Stripe secret key in env (STRIPE_SECRET_KEY)
//
// If either is missing we don't fail the migration — we surface a
// loud warning so the operator can finish the job manually in the
// Stripe dashboard. The Upstash migration has already succeeded by
// the time we hit this phase and we don't want a Stripe outage to
// undo it.
async function migrateStripeCustomer(member) {
  header("Stripe customer (email field)");
  if (!stripe) {
    note(
      "STRIPE_SECRET_KEY not set — skipping. Update the customer's email"
    );
    note(
      "in the Stripe dashboard manually, or re-run with STRIPE_SECRET_KEY"
    );
    note("in env. Otherwise the member can't sign in.");
    return;
  }
  const customerId = member && member.stripeCustomerId;
  if (!customerId) {
    note("no stripeCustomerId on the member record — nothing to update");
    return;
  }
  // Pull the current Stripe email so we can show before → after even
  // when COMMIT is off. customers.retrieve is read-only.
  let current;
  try {
    current = await stripe.customers.retrieve(customerId);
  } catch (err) {
    console.error(`  ! Stripe customer fetch failed: ${err.message}`);
    return;
  }
  if (current.deleted) {
    note(`Stripe customer ${customerId} is deleted; skipping`);
    return;
  }
  const currentEmail = (current.email || "").toLowerCase().trim();
  if (currentEmail === TO) {
    note(
      `Stripe customer ${customerId} already on ${TO} — nothing to do`
    );
    return;
  }
  row("update stripe", `customer ${customerId}: ${currentEmail} → ${TO}`);
  if (!COMMIT) {
    counts.stripeCustomersUpdated++;
    return;
  }
  try {
    await stripe.customers.update(customerId, { email: TO });
    counts.stripeCustomersUpdated++;
  } catch (err) {
    console.error(`  ! Stripe customer update failed: ${err.message}`);
  }
}

// ---- main ----------------------------------------------------------

async function main() {
  console.log(`migrate-member-email · ${mode}`);
  await preflight();

  // Load the member record up front so we can rewrite reverse-lookup
  // strings (member:by-customer / member:by-session) using its
  // customerId / sessionId fields.
  const member = await redis.get(`member:${FROM}`);

  await migrateSimpleKeyRenames();
  await migrateIndexMemberships();
  await migrateReverseLookups(member);
  await migrateAuthoredComments();
  await migrateThreadRepliesElsewhere();
  await migrateLoungePostsAndReactions();
  await migrateAuthoredRecordsViaIndex(
    `notes:by-member:${FROM}`,
    "note:",
    "fromEmail",
    "notesRewritten",
    "Notes from the desk"
  );
  await migrateAuthoredRecordsViaIndex(
    `case-submissions:by-email:${FROM}`,
    "case-submission:",
    "memberEmail",
    "caseSubmissionsRewritten",
    "Case submissions"
  );
  await migrateAuthoredRecordsViaIndex(
    `notifications:member:${FROM}`,
    "notification:",
    "memberEmail",
    "notificationsRewritten",
    "Notifications"
  );

  // Stripe is the upstream identity for paid members — emailHasActive-
  // Membership looks the customer up there before issuing a magic link.
  // Without this step the migrated member can't sign in at all because
  // Stripe still maps the old email to the customer record.
  await migrateStripeCustomer(member);

  // Safety net: after all the targeted migrations, scan for any key
  // whose name still contains FROM. In COMMIT mode this surfaces
  // anything we forgot — namespaces we didn't anticipate, audit logs,
  // future features. In DRY-RUN it's noisier (every key we're about
  // to rename also matches) but still useful as a "did we cover the
  // whole footprint" check.
  header("Leftover scan (keys still containing FROM)");
  const leftover = await scanAll(`*${FROM}*`);
  if (leftover.length === 0) {
    note("clean — no keys reference FROM");
  } else {
    note(
      COMMIT
        ? `WARNING: ${leftover.length} key(s) still reference FROM after migration:`
        : `${leftover.length} key(s) currently reference FROM (will be covered by the migration plan above unless flagged here):`
    );
    for (const key of leftover) {
      console.log(`    ${key}`);
    }
  }

  header("Summary");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  if (!COMMIT) {
    console.log("");
    console.log("(dry-run — no writes performed. Re-run with --commit to apply.)");
  } else {
    console.log("");
    console.log("Migration complete. The member must re-request a magic link");
    console.log("to get a session bound to the new email.");
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
