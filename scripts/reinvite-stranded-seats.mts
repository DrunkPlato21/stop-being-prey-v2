// One-off rescue: re-invite the people whose granted seat was never reachable.
//
// Both donor lanes used to mint the recipient's first sign-in link with the
// 24-hour default TTL. A granted seat arrives unannounced, so plenty of
// recipients opened the mail after the link had already died, and the weekly
// digest that follows carries no sign-in link of its own. Their seat stayed
// live and paid for the whole time. Only the door was shut.
//
// This mints a fresh link on the CURRENT granted-seat TTL and sends the
// re-invite. It is deliberately a script and not a cron: it is a one-time
// repair of a specific cohort, not a recurring behaviour.
//
// Picks a recipient only when ALL of these hold:
//   - a pool request in status "granted"
//   - a member record that still reads active
//   - a prepaid term that has NOT already run out (never invite someone
//     into a seat that is already dead)
//   - zero behavioural stamps: no presence, no desk visit, ever
//
// Reads the PRODUCTION keyspace directly, the same way the engagement
// inspector does, because that is where the real grants live. Magic-link
// keys are NOT namespaced (`magic:` has no dev prefix), so a token minted
// from here resolves in production, which is the whole point.
//
// Dry run by default. Prints exactly who would be mailed and stops.
//
//   npx tsx --env-file=.env.local scripts/reinvite-stranded-seats.mts
//   npx tsx --env-file=.env.local scripts/reinvite-stranded-seats.mts --send

import { Redis } from "@upstash/redis";
import { GRANTED_SEAT_LINK_TTL_SECONDS, createMagicLink } from "../src/lib/auth";
import { sendGrantedSeatReinviteEmail } from "../src/lib/email";

const SEND = process.argv.includes("--send");
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

// Resend allows 10 requests a second and counts a 429 as a plain failure,
// which is how a whole digest quietly lost members once. Nine emails do not
// need speed.
const PACE_MS = 250;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const BASE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://stopbeingprey.com"
).replace(/\/$/, "");

type PoolRequestish = {
  email: string;
  status?: string;
  grantedAt?: number | null;
  membershipExpiresAt?: number | null;
};

type Memberish = {
  email: string;
  status?: string;
  stripeCustomerId?: string | null;
};

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function num(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Has this person ever actually been inside? Any stamp at all counts. */
async function hasEverArrived(email: string): Promise<boolean> {
  const [presenceScore, presenceHash, deskLast] = await Promise.all([
    redis.zscore("presence:index", email).catch(() => null),
    redis.hgetall<Record<string, string>>(`presence:hash:${email}`).catch(
      () => null
    ),
    redis.get(`desk:last-visited:${email}`).catch(() => null),
  ]);
  const lastSeen = num(presenceScore) ?? num(presenceHash?.lastSeenAt);
  return !!(lastSeen || num(deskLast));
}

async function main() {
  const ids = await redis.zrange<string[]>("pool:requests:all", 0, -1);
  console.log(`scanning ${ids.length} pool request(s)\n`);

  const targets: {
    email: string;
    customerId: string;
    expiresAt: number;
    grantedAt: number | null;
  }[] = [];
  const skipped: string[] = [];

  for (const id of ids) {
    const req = parse<PoolRequestish>(await redis.get(`pool:request:${id}`));
    if (!req?.email || req.status !== "granted") continue;

    const email = req.email;
    const member = parse<Memberish>(await redis.get(`member:${email}`));

    if (!member) {
      skipped.push(`${email}  no member record`);
      continue;
    }
    if (member.status !== "active") {
      skipped.push(`${email}  member status=${member.status}`);
      continue;
    }
    if (!member.stripeCustomerId) {
      skipped.push(`${email}  no customer id, cannot mint a link`);
      continue;
    }
    const expiresAt = num(req.membershipExpiresAt);
    if (!expiresAt) {
      skipped.push(`${email}  no term expiry on the request`);
      continue;
    }
    if (expiresAt <= NOW) {
      skipped.push(`${email}  seat already expired ${dateLabel(expiresAt)}`);
      continue;
    }
    if (await hasEverArrived(email)) {
      skipped.push(`${email}  has signed in before, leave them alone`);
      continue;
    }

    targets.push({
      email,
      customerId: member.stripeCustomerId,
      expiresAt,
      grantedAt: num(req.grantedAt),
    });
  }

  targets.sort((a, b) => a.expiresAt - b.expiresAt);

  console.log(`--- ${targets.length} stranded seat(s) to re-invite ---`);
  for (const t of targets) {
    const left = Math.round((t.expiresAt - NOW) / DAY);
    console.log(
      `  ${t.email.padEnd(28)} seat runs to ${dateLabel(t.expiresAt)}  (${left}d left)`
    );
  }
  if (skipped.length) {
    console.log(`\n--- ${skipped.length} skipped ---`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  const ttlDays = Math.round(GRANTED_SEAT_LINK_TTL_SECONDS / 86400);
  console.log(`\nnew links will be valid for ${ttlDays} day(s).`);

  if (!SEND) {
    console.log("\nDRY RUN. Nothing sent. Re-run with --send to mail these.");
    return;
  }

  console.log("\nsending...\n");
  let ok = 0;
  let failed = 0;
  for (const t of targets) {
    const linkId = await createMagicLink(
      { email: t.email, customerId: t.customerId, next: "/desk" },
      GRANTED_SEAT_LINK_TTL_SECONDS
    );
    if (!linkId) {
      console.error(`  FAIL  ${t.email}  could not mint a link`);
      failed++;
      continue;
    }
    const signInUrl = `${BASE_URL}/api/auth/callback?token=${encodeURIComponent(linkId)}`;
    const sent = await sendGrantedSeatReinviteEmail({
      to: t.email,
      expiresAtLabel: dateLabel(t.expiresAt),
      signInUrl,
    });
    if (sent.ok) {
      console.log(`  sent  ${t.email}`);
      ok++;
    } else {
      // Print the link so a failed send is recoverable by hand rather than
      // leaving that person stranded a second time.
      console.error(`  FAIL  ${t.email}  ${sent.error}`);
      console.error(`        link: ${signInUrl}`);
      failed++;
    }
    await sleep(PACE_MS);
  }
  console.log(`\ndone. sent ${ok}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
