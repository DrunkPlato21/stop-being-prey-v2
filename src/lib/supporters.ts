import { Redis } from "@upstash/redis";

export type AttributionPreference =
  | "full"
  | "first_last_initial"
  | "first"
  | "anonymous";

export type SupporterSource = "stripe" | "lightning";

export type SupporterEntry = {
  id: string;
  timestamp: number;
  message: string;
  attribution: string;
  approved: boolean;
  visible: boolean;
  source: SupporterSource;
};

const INDEX_KEY = "supporters:index";
const ENTRY_PREFIX = "supporter:";

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

export function formatAttribution(
  preference: AttributionPreference,
  rawName: string | undefined,
  rawCity: string | undefined
): string {
  const name = (rawName ?? "").trim();
  const city = (rawCity ?? "").trim();

  if (preference === "anonymous" || !name) return "a reader writes";

  const parts = name.split(/\s+/);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";

  if (preference === "full") {
    return city ? `${name}, ${city}` : name;
  }
  if (preference === "first_last_initial") {
    if (last) return `${first} ${last.charAt(0).toUpperCase()}.`;
    return first;
  }
  return first;
}

export async function createEntry(
  partial: Omit<SupporterEntry, "approved" | "visible"> & {
    approved?: boolean;
    visible?: boolean;
  }
): Promise<SupporterEntry | null> {
  const client = getClient();
  if (!client) return null;

  const entry: SupporterEntry = {
    id: partial.id,
    timestamp: partial.timestamp,
    message: partial.message,
    attribution: partial.attribution,
    source: partial.source,
    approved: partial.approved ?? true,
    visible: partial.visible ?? true,
  };

  const key = `${ENTRY_PREFIX}${entry.id}`;
  await client.set(key, JSON.stringify(entry));
  await client.zadd(INDEX_KEY, { score: entry.timestamp, member: entry.id });

  return entry;
}

async function fetchByIds(ids: string[]): Promise<SupporterEntry[]> {
  const client = getClient();
  if (!client || ids.length === 0) return [];
  const keys = ids.map((id) => `${ENTRY_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: SupporterEntry[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string" ? (JSON.parse(value) as SupporterEntry) : (value as SupporterEntry);
      out.push(parsed);
    } catch {
      // skip malformed entry
    }
  }
  return out;
}

export async function listVisible(
  page = 1,
  pageSize = 20
): Promise<{ entries: SupporterEntry[]; total: number }> {
  const client = getClient();
  if (!client) return { entries: [], total: 0 };

  const total = await client.zcard(INDEX_KEY);
  if (total === 0) return { entries: [], total: 0 };

  // Walk the sorted-set newest-first, batching enough to fill the page after
  // filtering out hidden/unapproved entries. Cap the walk to keep cost bounded.
  const safetyCap = 500;
  const collected: SupporterEntry[] = [];
  const startIndex = (page - 1) * pageSize;
  const targetCount = startIndex + pageSize;

  let cursor = 0;
  while (collected.length < targetCount && cursor < safetyCap) {
    const ids = (await client.zrange(INDEX_KEY, cursor, cursor + 49, {
      rev: true,
    })) as string[];
    if (ids.length === 0) break;
    const batch = await fetchByIds(ids);
    for (const entry of batch) {
      if (entry.approved && entry.visible) collected.push(entry);
    }
    cursor += ids.length;
    if (ids.length < 50) break;
  }

  return {
    entries: collected.slice(startIndex, startIndex + pageSize),
    total,
  };
}

export async function listAll(): Promise<SupporterEntry[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(INDEX_KEY, 0, -1, {
    rev: true,
  })) as string[];
  return fetchByIds(ids);
}

export async function getEntry(id: string): Promise<SupporterEntry | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${ENTRY_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as SupporterEntry)
      : (raw as SupporterEntry);
  } catch {
    return null;
  }
}

export async function updateEntry(
  id: string,
  patch: Partial<Pick<SupporterEntry, "attribution" | "visible" | "approved" | "message">>
): Promise<SupporterEntry | null> {
  const client = getClient();
  if (!client) return null;
  const current = await getEntry(id);
  if (!current) return null;
  const next: SupporterEntry = { ...current, ...patch };
  await client.set(`${ENTRY_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  await client.del(`${ENTRY_PREFIX}${id}`);
  await client.zrem(INDEX_KEY, id);
  return true;
}
