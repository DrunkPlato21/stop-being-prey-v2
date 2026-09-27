import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

// Every way a member can fail to get in, written down as it happens.
//
// Before this existed a failed sign-in left no trace anywhere: a scanner
// spending a link, a typo'd address, a mailbox Resend had quietly
// suppressed. The only alarm was a member tracking down Clay's address
// (Janice, 2026-09-27), and by then it had been happening for weeks.
// Read on /admin/sign-in-links; the nav dot lights when one lands.
//
// Redis schema:
//   signin:failures        ZSET  score = at (ms), member = JSON entry
//   signin:delivery-seen   SET   Resend email ids already logged by the
//                                delivery check, so a rerun can't double-log

export const FAILURES_KEY = "signin:failures";
const DELIVERY_SEEN_KEY = "signin:delivery-seen";
const KEEP = 1000;

export type SignInFailureKind =
  | "link_used" // clicked a link that was already spent
  | "link_expired" // clicked a link past its TTL
  | "link_unknown" // token we have no record of (garbage, or minted before records)
  | "no_account" // asked for a link with an email that isn't a live member
  | "rate_limited" // asked too many times in an hour
  | "send_failed" // Resend refused the sign-in email outright
  | "undeliverable" // Resend bounced, suppressed, or took a spam complaint
  | "auth_unavailable";

export type SignInFailure = {
  id: string;
  at: number;
  kind: SignInFailureKind;
  email: string | null;
  detail: string | null;
  /** Written from a local dev server. Dev shares prod Redis, so this
      keeps a test run from reading as a real member's trouble. */
  dev?: boolean;
};

let cached: Redis | null = null;
function redis(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

/** Fire-and-forget safe: never throws, so a logging hiccup can't turn
    into a sign-in failure of its own. */
export async function recordSignInFailure(entry: {
  kind: SignInFailureKind;
  email?: string | null;
  detail?: string | null;
  at?: number;
}): Promise<void> {
  const client = redis();
  if (!client) return;
  const record: SignInFailure = {
    id: randomUUID(),
    at: entry.at ?? Date.now(),
    kind: entry.kind,
    email: entry.email ?? null,
    detail: entry.detail ?? null,
    ...(process.env.NODE_ENV !== "production" ? { dev: true } : {}),
  };
  try {
    await client.zadd(FAILURES_KEY, {
      score: record.at,
      member: JSON.stringify(record),
    });
    await client.zremrangebyrank(FAILURES_KEY, 0, -(KEEP + 1));
  } catch (err) {
    console.error("[signin-failures] record failed:", err);
  }
}

export async function listSignInFailures(limit = 200): Promise<SignInFailure[]> {
  const client = redis();
  if (!client) return [];
  const raw = (await client
    .zrange(FAILURES_KEY, 0, limit - 1, { rev: true })
    .catch(() => [])) as unknown[];
  const out: SignInFailure[] = [];
  for (const r of raw) {
    try {
      out.push(typeof r === "string" ? JSON.parse(r) : (r as SignInFailure));
    } catch {
      // skip a malformed row rather than blank the page
    }
  }
  return out;
}

/** True the first time a Resend email id is seen, false after. */
export async function claimDeliveryId(resendId: string): Promise<boolean> {
  const client = redis();
  if (!client) return false;
  const added = await client.sadd(DELIVERY_SEEN_KEY, resendId).catch(() => 0);
  return added === 1;
}
