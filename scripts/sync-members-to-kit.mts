// Reconcile paid members into the Kit (ConvertKit) email list.
//
// Why this exists: members are created from the Stripe webhook, which
// best-effort applies the Kit "Members" tag (lib/kit.ts). If KIT_API_KEY /
// KIT_MEMBERS_TAG_ID weren't set at signup time, or Kit had a transient
// failure, the member lands in Stripe + Redis but never in Kit. Those
// failures are logged and swallowed on purpose (a Kit hiccup must never
// block a paid signup), so the email list quietly drifts smaller than the
// membership. This walks every current member and re-applies BOTH the SBP
// list subscription and the Members tag. Both Kit calls are idempotent, so
// it is safe to re-run any time the counts drift.
//
// Touches LIVE data: it reads the real member keyspace and writes to the
// real Kit list. Run it from a local box with prod creds in .env.local.
// Dry-run by default; pass --apply to actually write to Kit.
//
// Run:
//   npx tsx scripts/sync-members-to-kit.mts                 dry run, reports the gap
//   npx tsx scripts/sync-members-to-kit.mts --apply         subscribe + tag every current member
//   npx tsx scripts/sync-members-to-kit.mts --apply --include-canceled   also churned members

import { readFileSync } from "node:fs";

// 1. Load .env.local so UPSTASH + KIT creds are present.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// 2. Force the LIVE member keyspace. members.ts computes its key prefix at
//    module load from NODE_ENV (non-prod -> "dev:"), so without this a local
//    run reads the dev sandbox, not the real paid members. Must be set
//    BEFORE members.ts is imported, hence the dynamic import lower down.
process.env.MEMBERS_KEY_PREFIX = "";

const APPLY = process.argv.includes("--apply");
const INCLUDE_CANCELED = process.argv.includes("--include-canceled");

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  console.error("Missing UPSTASH creds in .env.local; cannot read members.");
  process.exit(1);
}
if (APPLY && (!process.env.KIT_API_KEY || !process.env.KIT_MEMBERS_TAG_ID)) {
  console.error(
    "Missing KIT_API_KEY or KIT_MEMBERS_TAG_ID in .env.local; cannot write to Kit.\n" +
      "Add both (from Vercel) to .env.local, or run without --apply for a dry run."
  );
  process.exit(1);
}

// 3. Import the real, tested helpers AFTER env is set. Relative paths so we
//    never depend on tsconfig alias resolution; both modules are leaf libs
//    (members.ts -> @upstash/redis only, kit.ts -> fetch only).
const { listAllMemberEmails, getMember } = await import("../src/lib/members.ts");
const { subscribeToList, applyMembersTag } = await import("../src/lib/kit.ts");

const emails = await listAllMemberEmails();
console.log(`Found ${emails.length} member record(s) in the live keyspace.\n`);

type Row = { email: string; status: string };
const rows: Row[] = [];
for (const email of emails) {
  const rec = await getMember(email).catch(() => null);
  rows.push({ email, status: rec?.status ?? "unknown" });
}

const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});
console.log("Members by status:");
for (const [status, n] of Object.entries(byStatus).sort()) {
  console.log(`  ${status.padEnd(12)} ${n}`);
}
console.log();

// Current members are anyone still paying or mid-recovery; canceled are
// excluded unless asked for. past_due stays in (e.g. a failed renewal we
// still want on the list so they get the nudge).
const CURRENT = new Set(["active", "trialing", "past_due"]);
const targets = rows.filter((r) =>
  INCLUDE_CANCELED ? r.status !== "unknown" : CURRENT.has(r.status)
);

console.log(
  `${targets.length} member(s) targeted` +
    (INCLUDE_CANCELED
      ? " (everyone, including canceled)."
      : " (active / trialing / past_due).")
);

if (!APPLY) {
  console.log(
    "\nDRY RUN. No writes. Re-run with --apply to subscribe + tag these in Kit.\n"
  );
  for (const t of targets) console.log(`  would sync  ${t.email}  [${t.status}]`);
  process.exit(0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kit v4 rate-limits aggressively (HTTP 429, ~120 req/min). Retry each call
// with exponential backoff, and pace every call below the limit. Idempotent,
// so a call that 429s and is retried (or re-run on the next pass) is safe.
type KitRes = { ok: boolean; reason?: string; status?: number };
async function kitCall(fn: () => Promise<KitRes>): Promise<KitRes> {
  let delayMs = 3000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fn();
    if (res.ok || res.status !== 429) return res;
    await sleep(delayMs);
    delayMs = Math.min(delayMs * 2, 30000);
  }
  return { ok: false, reason: "rate_limited", status: 429 };
}

console.log(
  "\nApplying: subscribe to SBP list + apply Members tag (both idempotent).\n" +
    "Paced under Kit's rate limit with 429 backoff, so this takes a few minutes.\n"
);
let ok = 0;
const failures: string[] = [];
let i = 0;
for (const t of targets) {
  i++;
  const sub = await kitCall(() => subscribeToList(t.email));
  await sleep(700);
  const tag = await kitCall(() => applyMembersTag(t.email));
  await sleep(700);
  if (sub.ok && tag.ok) {
    ok++;
    console.log(`  [${i}/${targets.length}] ok   ${t.email}`);
  } else {
    const why = [
      sub.ok ? null : `list:${sub.reason}${sub.status ? `(${sub.status})` : ""}`,
      tag.ok ? null : `tag:${tag.reason}${tag.status ? `(${tag.status})` : ""}`,
    ]
      .filter(Boolean)
      .join(" ");
    failures.push(`${t.email} - ${why}`);
    console.log(`  [${i}/${targets.length}] FAIL ${t.email} - ${why}`);
  }
}

console.log(`\nDone. ${ok}/${targets.length} synced.`);
if (failures.length) {
  console.log(`\n${failures.length} failed:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
