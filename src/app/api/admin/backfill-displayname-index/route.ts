import { Redis } from "@upstash/redis";
import { normalizeForCheck } from "@/lib/display-name";
import type { Profile } from "@/lib/comments";

// One-shot (idempotent) backfill for the displayname:taken:<norm>
// uniqueness index. Walks every profile:<email> key, normalizes the
// stored displayName, and SETNX-claims it for the owner email. Safe to
// run multiple times — already-claimed names are skipped.
//
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*. Run once
// after deploying the display-name rules so existing members keep
// their current names instead of having them quietly re-disambiguated
// at next signup.

export const runtime = "nodejs";
export const maxDuration = 60;

const PROFILE_PREFIX = "profile:";
const CLAIM_PREFIX = "displayname:taken:";
const SCAN_PAGE_SIZE = 200;

let cached: Redis | null = null;
function getRedis(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function parseProfile(raw: unknown): Profile | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as Profile)
      : (raw as Profile);
  } catch {
    return null;
  }
}

export async function POST() {
  const client = getRedis();
  if (!client) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let cursor: string | number = 0;
  let claimed = 0;
  let skipped = 0;
  let conflicts = 0;
  let unnamed = 0;
  let unreadable = 0;

  do {
    const result = (await client.scan(cursor, {
      match: `${PROFILE_PREFIX}*`,
      count: SCAN_PAGE_SIZE,
    })) as [string | number, string[]];

    const nextCursor = result[0];
    const keys = Array.isArray(result[1]) ? result[1] : [];

    for (const key of keys) {
      const email = key.slice(PROFILE_PREFIX.length).toLowerCase();
      if (!email) continue;

      const raw = await client.get<string>(key);
      const profile = parseProfile(raw);
      if (!profile) {
        unreadable += 1;
        continue;
      }
      const displayName = profile.displayName?.trim();
      if (!displayName) {
        unnamed += 1;
        continue;
      }
      const norm = normalizeForCheck(displayName);
      if (!norm) {
        unnamed += 1;
        continue;
      }

      const claimKey = `${CLAIM_PREFIX}${norm}`;
      // Atomic claim. If something already claimed it, check whether
      // that something is us; if not, count a conflict so the admin
      // can resolve manually.
      const setRes = await client.set(claimKey, email, { nx: true });
      if (setRes === "OK") {
        claimed += 1;
        continue;
      }
      const currentOwner = (await client.get<string>(claimKey)) ?? "";
      const ownerEmail =
        typeof currentOwner === "string" ? currentOwner : String(currentOwner);
      if (ownerEmail.toLowerCase() === email) {
        skipped += 1;
      } else {
        conflicts += 1;
      }
    }

    cursor =
      typeof nextCursor === "string"
        ? Number.parseInt(nextCursor, 10) || 0
        : nextCursor;
  } while (cursor !== 0);

  const summary = `Claimed ${claimed}, already-mine ${skipped}, conflicts ${conflicts}, unnamed ${unnamed}, unreadable ${unreadable}.`;
  return Response.json({
    ok: true,
    summary,
    claimed,
    skipped,
    conflicts,
    unnamed,
    unreadable,
  });
}
