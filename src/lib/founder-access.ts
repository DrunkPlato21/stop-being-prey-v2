import { Redis } from "@upstash/redis";
import { randomBytes } from "crypto";

// Single-use private access tokens that unlock the founder-pricing flow
// ($8 floor, pay-what-you-want, monthly/annual) after the public founder
// cap has filled. One token = one person.
//
// The token lives in Redis and is consumed on a *successful* membership
// checkout (in the Stripe webhook), so an abandoned Stripe session
// doesn't burn it. The public /membership page and checkout are
// unaffected: only a request carrying a valid, unused token gets the
// founder floor, and the server re-validates the token at checkout-create
// time so a client can't self-grant. Granting pricing only — no founder
// badge/slot is claimed (see the checkout: tier stays "regular").

const PREFIX = "founder-access:";

type FounderAccessRecord = {
  createdAt: number;
  note: string | null;
  /** Founder number to honor for this grant (e.g. 101). Assigned
      directly onto the member record by the webhook — it does NOT touch
      the FOUNDER_KEY counter, so the public "100 of 100" stays full. */
  founderNumber: number | null;
  usedAt: number | null;
  usedByEmail: string | null;
};

let cached: Redis | null = null;
function client(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function parse(raw: unknown): FounderAccessRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    const r = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<
      string,
      unknown
    >;
    if (!r || typeof r !== "object") return null;
    return {
      createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
      note: typeof r.note === "string" ? r.note : null,
      founderNumber:
        typeof r.founderNumber === "number" ? r.founderNumber : null,
      usedAt: typeof r.usedAt === "number" ? r.usedAt : null,
      usedByEmail: typeof r.usedByEmail === "string" ? r.usedByEmail : null,
    };
  } catch {
    return null;
  }
}

/** The token record if it exists and is unused, else null. */
export async function getFounderAccess(
  token: string | null | undefined
): Promise<FounderAccessRecord | null> {
  if (!token || typeof token !== "string") return null;
  const c = client();
  if (!c) return null;
  const rec = parse(await c.get(`${PREFIX}${token}`));
  if (!rec || rec.usedAt !== null) return null;
  return rec;
}

/** True only when the token exists and has not yet been consumed. */
export async function isFounderAccessValid(
  token: string | null | undefined
): Promise<boolean> {
  return (await getFounderAccess(token)) !== null;
}

/** Mark a token consumed. No-op if missing or already used. */
export async function consumeFounderAccess(
  token: string,
  email: string
): Promise<void> {
  const c = client();
  if (!c) return;
  const key = `${PREFIX}${token}`;
  const rec = parse(await c.get(key));
  if (!rec || rec.usedAt !== null) return;
  rec.usedAt = Date.now();
  rec.usedByEmail = email.toLowerCase().trim();
  await c.set(key, JSON.stringify(rec));
}

/** Mint a new single-use token. Returns the raw token string. */
export async function createFounderAccessToken(opts?: {
  note?: string;
  founderNumber?: number;
}): Promise<string> {
  const c = client();
  if (!c) throw new Error("Redis not configured");
  const token = randomBytes(24).toString("base64url");
  const rec: FounderAccessRecord = {
    createdAt: Date.now(),
    note: opts?.note ?? null,
    founderNumber:
      typeof opts?.founderNumber === "number" ? opts.founderNumber : null,
    usedAt: null,
    usedByEmail: null,
  };
  await c.set(`${PREFIX}${token}`, JSON.stringify(rec));
  return token;
}
