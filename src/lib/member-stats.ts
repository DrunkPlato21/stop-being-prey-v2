import { Redis } from "@upstash/redis";
import { monthlyEquivalentCents, type MemberRecord } from "./members";

// Read-side aggregates for the admin dashboard: the membership GROUND
// TRUTH (from members:all, not event counters) plus churn and engagement.
// Built because the funnel event counters started at zero the day they
// shipped, while 100+ members had already joined — so the dashboard read
// "0 conversions" against a real member base. These read the durable
// indexes instead.
//
// Like getPoolStats / getArticleCounts, the admin runs on localhost but
// wants PROD data, so reads default to the unprefixed (production)
// keyspace; `dev` switches to the dev sandbox. Members are dev-namespaced
// (lib/members.ts); comments / lounge / notes are not, so their reads
// always hit the live keys.

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

const DAY = 86_400_000;

function memberPrefix(dev: boolean): string {
  return dev ? "dev:" : "";
}

/* === Membership ground truth + churn ======================== */

export type MembershipStats = {
  total: number;
  joined7d: number;
  joined30d: number;
  active: number;
  canceled: number;
  other: number; // past_due / incomplete / paused / etc.
  canceled30d: number;
  tiers: { founder: number; charter: number; regular: number };
  intervals: { month: number; year: number };
  /** Monthly recurring revenue estimate, cents (active members only). */
  mrrCents: number;
};

function parseMember(raw: unknown): MemberRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as MemberRecord)
      : (raw as MemberRecord);
  } catch {
    return null;
  }
}

async function loadAllMembers(
  client: Redis,
  dev: boolean
): Promise<MemberRecord[]> {
  const p = memberPrefix(dev);
  const emails = ((await client
    .zrange(`${p}members:all`, 0, -1)
    .catch(() => [])) as unknown[]).filter(
    (v): v is string => typeof v === "string"
  );
  if (emails.length === 0) return [];
  const keys = emails.map((e) => `${p}member:${e}`);
  // MGET in chunks so a very large roster doesn't build one giant request.
  const out: MemberRecord[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const raw =
      ((await client.mget<(string | null)[]>(...slice).catch(() => [])) as
        | (string | null)[]) ?? [];
    raw.forEach((r) => {
      const m = parseMember(r);
      if (m) out.push(m);
    });
  }
  return out;
}

export async function getMembershipStats(
  dev = false
): Promise<MembershipStats> {
  const empty: MembershipStats = {
    total: 0,
    joined7d: 0,
    joined30d: 0,
    active: 0,
    canceled: 0,
    other: 0,
    canceled30d: 0,
    tiers: { founder: 0, charter: 0, regular: 0 },
    intervals: { month: 0, year: 0 },
    mrrCents: 0,
  };
  const client = getClient();
  if (!client) return empty;

  const members = await loadAllMembers(client, dev);
  const now = Date.now();
  const s = { ...empty, tiers: { ...empty.tiers }, intervals: { ...empty.intervals } };

  for (const m of members) {
    s.total += 1;
    if (now - m.createdAt <= 7 * DAY) s.joined7d += 1;
    if (now - m.createdAt <= 30 * DAY) s.joined30d += 1;

    const isActive = m.status === "active" || m.status === "trialing";
    if (isActive) {
      s.active += 1;
      s.tiers[m.tier] += 1;
      if (m.interval === "year") s.intervals.year += 1;
      else s.intervals.month += 1;
      s.mrrCents += monthlyEquivalentCents(m);
    } else if (m.status === "canceled") {
      s.canceled += 1;
      if (typeof m.canceledAt === "number" && now - m.canceledAt <= 30 * DAY) {
        s.canceled30d += 1;
      }
    } else {
      s.other += 1;
    }
  }
  return s;
}

/* === Engagement / health ==================================== */

export type EngagementStats = {
  comments: { total: number; d7: number; d30: number };
  lounge: { total: number; d7: number; d30: number };
  notes: { total: number; d7: number; d30: number };
  /** Distinct member emails who commented, posted, or left a note in the
      last 30 days — the "are members actually using the room" number. */
  activeMembers30d: number;
};

async function countWindow(
  client: Redis,
  index: string,
  now: number
): Promise<{ total: number; d7: number; d30: number }> {
  const [total, d7, d30] = await Promise.all([
    client.zcard(index).catch(() => 0),
    client.zcount(index, now - 7 * DAY, "+inf").catch(() => 0),
    client.zcount(index, now - 30 * DAY, "+inf").catch(() => 0),
  ]);
  return {
    total: typeof total === "number" ? total : 0,
    d7: typeof d7 === "number" ? d7 : 0,
    d30: typeof d30 === "number" ? d30 : 0,
  };
}

// Recent member ids in a window, capped so the admin page never fans out
// an unbounded MGET.
async function recentIds(
  client: Redis,
  index: string,
  sinceMs: number,
  cap = 800
): Promise<string[]> {
  const raw = (await client
    .zrange(index, sinceMs, "+inf", { byScore: true })
    .catch(() => [])) as unknown[];
  return raw
    .filter((v): v is string => typeof v === "string")
    .slice(-cap);
}

async function emailsFrom(
  client: Redis,
  ids: string[],
  keyPrefix: string,
  emailField: string
): Promise<string[]> {
  if (ids.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200).map((id) => `${keyPrefix}${id}`);
    const raw =
      ((await client.mget<(string | null)[]>(...slice).catch(() => [])) as
        | (string | null)[]) ?? [];
    raw.forEach((r) => {
      const rec = parseMember(r) as Record<string, unknown> | null;
      const email = rec?.[emailField];
      if (typeof email === "string" && email) out.push(email.toLowerCase());
    });
  }
  return out;
}

export async function getEngagementStats(): Promise<EngagementStats> {
  const empty: EngagementStats = {
    comments: { total: 0, d7: 0, d30: 0 },
    lounge: { total: 0, d7: 0, d30: 0 },
    notes: { total: 0, d7: 0, d30: 0 },
    activeMembers30d: 0,
  };
  const client = getClient();
  if (!client) return empty;
  const now = Date.now();

  // comments / lounge / notes are never dev-namespaced — always live keys.
  const [comments, lounge, notes] = await Promise.all([
    countWindow(client, "comments:all", now),
    countWindow(client, "lounge:posts", now),
    countWindow(client, "notes:all", now),
  ]);

  const since = now - 30 * DAY;
  const [cIds, lIds, nIds] = await Promise.all([
    recentIds(client, "comments:all", since),
    recentIds(client, "lounge:posts", since),
    recentIds(client, "notes:all", since),
  ]);
  const [cEmails, lEmails, nEmails] = await Promise.all([
    emailsFrom(client, cIds, "comment:", "email"),
    emailsFrom(client, lIds, "lounge:post:", "memberEmail"),
    emailsFrom(client, nIds, "note:", "fromEmail"),
  ]);
  const active = new Set<string>([...cEmails, ...lEmails, ...nEmails]);

  return {
    comments,
    lounge,
    notes,
    activeMembers30d: active.size,
  };
}
