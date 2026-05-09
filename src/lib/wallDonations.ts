import { Redis } from "@upstash/redis";

export type DonationStatus = "pending" | "approved" | "rejected";

export type WallDonation = {
  id: string;
  wallSlug: string;
  timestamp: number;
  /** Raw donor name. For display, use displayName(), which respects
      anonymous and empty-name cases. */
  name: string;
  amountCents: number;
  note: string;
  showAmount: boolean;
  anonymous: boolean;
  status: DonationStatus;
  stripeSessionId: string;
};

const indexKey = (slug: string) => `wall:${slug}:donations:index`;
const entryKey = (slug: string, id: string) => `wall:${slug}:donation:${id}`;
const pendingIndexKey = "walls:donations:pending";

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isStorageConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function displayName(d: Pick<WallDonation, "name" | "anonymous">): string {
  if (d.anonymous) return "Anonymous";
  const trimmed = d.name.trim();
  return trimmed.length > 0 ? trimmed : "a reader";
}

export async function createDonation(
  partial: Omit<WallDonation, "status"> & { status?: DonationStatus }
): Promise<WallDonation | null> {
  const client = getClient();
  if (!client) return null;

  const donation: WallDonation = {
    ...partial,
    status: partial.status ?? "pending",
  };

  await client.set(
    entryKey(donation.wallSlug, donation.id),
    JSON.stringify(donation)
  );
  await client.zadd(indexKey(donation.wallSlug), {
    score: donation.timestamp,
    member: donation.id,
  });
  if (donation.status === "pending") {
    // Composite member: "{slug}:{id}" so a single global pending index
    // can drive the admin queue across all walls.
    await client.zadd(pendingIndexKey, {
      score: donation.timestamp,
      member: `${donation.wallSlug}:${donation.id}`,
    });
  }
  return donation;
}

async function fetchByIds(
  slug: string,
  ids: string[]
): Promise<WallDonation[]> {
  const client = getClient();
  if (!client || ids.length === 0) return [];
  const keys = ids.map((id) => entryKey(slug, id));
  const raw = await client.mget<(string | WallDonation | null)[]>(...keys);
  const out: WallDonation[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as WallDonation)
          : (value as WallDonation);
      out.push(parsed);
    } catch {
      // skip malformed entry
    }
  }
  return out;
}

export async function listByWall(slug: string): Promise<WallDonation[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(indexKey(slug), 0, -1, {
    rev: true,
  })) as string[];
  return fetchByIds(slug, ids);
}

export async function listApprovedByWall(slug: string): Promise<WallDonation[]> {
  const all = await listByWall(slug);
  return all.filter((d) => d.status === "approved");
}

export async function listAllPending(): Promise<WallDonation[]> {
  const client = getClient();
  if (!client) return [];
  const composite = (await client.zrange(pendingIndexKey, 0, -1, {
    rev: true,
  })) as string[];
  if (composite.length === 0) return [];

  const out: WallDonation[] = [];
  // Group by slug so we can mget per wall.
  const bySlug = new Map<string, string[]>();
  for (const c of composite) {
    const idx = c.indexOf(":");
    if (idx < 0) continue;
    const slug = c.slice(0, idx);
    const id = c.slice(idx + 1);
    const list = bySlug.get(slug) ?? [];
    list.push(id);
    bySlug.set(slug, list);
  }
  for (const [slug, ids] of bySlug.entries()) {
    const fetched = await fetchByIds(slug, ids);
    for (const d of fetched) {
      // Defensive: only surface those still pending.
      if (d.status === "pending") out.push(d);
    }
  }
  // Sort newest-first overall.
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

export async function getDonation(
  slug: string,
  id: string
): Promise<WallDonation | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string | WallDonation>(entryKey(slug, id));
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as WallDonation)
      : (raw as WallDonation);
  } catch {
    return null;
  }
}

export async function setDonationStatus(
  slug: string,
  id: string,
  status: DonationStatus
): Promise<WallDonation | null> {
  const client = getClient();
  if (!client) return null;
  const current = await getDonation(slug, id);
  if (!current) return null;
  const next: WallDonation = { ...current, status };
  await client.set(entryKey(slug, id), JSON.stringify(next));
  // Remove from pending index whenever status leaves pending.
  if (status !== "pending") {
    await client.zrem(pendingIndexKey, `${slug}:${id}`);
  }
  return next;
}

export type WallStats = {
  totalRaisedCents: number;
  donorCount: number;
  topDonor: WallDonation | null;
};

/**
 * Stats are computed over approved donations only — pending and rejected
 * notes don't appear on the wall and shouldn't pump the counter.
 */
export async function getWallStats(slug: string): Promise<WallStats> {
  const approved = await listApprovedByWall(slug);
  if (approved.length === 0) {
    return { totalRaisedCents: 0, donorCount: 0, topDonor: null };
  }
  let totalRaisedCents = 0;
  let topDonor: WallDonation = approved[0];
  for (const d of approved) {
    totalRaisedCents += d.amountCents;
    if (d.amountCents > topDonor.amountCents) topDonor = d;
  }
  return {
    totalRaisedCents,
    donorCount: approved.length,
    topDonor,
  };
}
