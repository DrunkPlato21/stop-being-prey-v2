// Give back a prepaid term that was never usable.
//
// A donor buys a fixed term, but the clock starts at the GRANT, not at
// first use. Anyone stranded behind the old 24-hour sign-in link therefore
// burned their whole term locked out: the seat was paid for and live the
// entire time and they could not open the door. Restarting the clock is
// what the donor actually bought.
//
// The term is stored in two places that the code explicitly requires to
// agree (see lib/seat-grants.ts): `giftExpiresAt` on the member record and
// `membershipExpiresAt` on the pool request. This writes BOTH or neither.
//
// Reads and writes the PRODUCTION keyspace. Dry run by default.
//
//   npx tsx --env-file=.env.local scripts/extend-granted-seat.mts <email> [months]
//   npx tsx --env-file=.env.local scripts/extend-granted-seat.mts <email> [months] --apply

import { Redis } from "@upstash/redis";

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const email = (args[0] ?? "").toLowerCase().trim();
const months = Number(args[1] ?? 3);

if (!email || !Number.isFinite(months) || months <= 0) {
  console.error(
    "usage: extend-granted-seat.mts <email> [months=3] [--apply]"
  );
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const NOW = Date.now();

/** Same month arithmetic lib/gifts.ts uses, so a restarted term lands on
    the same kind of date a fresh grant would. */
function addMonths(fromMs: number, n: number): number {
  const d = new Date(fromMs);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function label(ms: number | null | undefined): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "(none)";
}

async function main() {
  const member = parse<Record<string, unknown>>(
    await redis.get(`member:${email}`)
  );
  if (!member) {
    console.error(`no member record for ${email}`);
    process.exit(1);
  }

  const ids = await redis.zrange<string[]>("pool:requests:all", 0, -1);
  let requestId: string | null = null;
  let request: Record<string, unknown> | null = null;
  for (const id of ids) {
    const r = parse<Record<string, unknown>>(
      await redis.get(`pool:request:${id}`)
    );
    if (r?.email === email && r.status === "granted") {
      requestId = id;
      request = r;
      break;
    }
  }
  if (!requestId || !request) {
    console.error(`no granted pool request for ${email}`);
    process.exit(1);
  }

  const newExpiry = addMonths(NOW, months);

  console.log(`member:${email}`);
  console.log(`  giftExpiresAt        ${label(member.giftExpiresAt as number)}  ->  ${label(newExpiry)}`);
  console.log(`pool:request:${requestId}`);
  console.log(`  membershipExpiresAt  ${label(request.membershipExpiresAt as number)}  ->  ${label(newExpiry)}`);
  console.log(`\nrestarting a ${months}-month term from today.`);

  if (!APPLY) {
    console.log("\nDRY RUN. Nothing written. Re-run with --apply.");
    return;
  }

  // Member first. If the second write failed, a member whose record says
  // they have longer than the request does is the harmless direction: the
  // reminder cron reads the REQUEST, so it would simply nudge early rather
  // than cut anybody off.
  await redis.set(
    `member:${email}`,
    JSON.stringify({ ...member, giftExpiresAt: newExpiry })
  );
  await redis.set(
    `pool:request:${requestId}`,
    JSON.stringify({ ...request, membershipExpiresAt: newExpiry })
  );

  const checkM = parse<Record<string, unknown>>(
    await redis.get(`member:${email}`)
  );
  const checkR = parse<Record<string, unknown>>(
    await redis.get(`pool:request:${requestId}`)
  );
  console.log("\nwritten. reading back:");
  console.log(`  giftExpiresAt        ${label(checkM?.giftExpiresAt as number)}`);
  console.log(`  membershipExpiresAt  ${label(checkR?.membershipExpiresAt as number)}`);
  if (checkM?.giftExpiresAt !== newExpiry || checkR?.membershipExpiresAt !== newExpiry) {
    console.error("\nMISMATCH after write. Inspect by hand before sending mail.");
    process.exit(1);
  }
  console.log("both agree.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
