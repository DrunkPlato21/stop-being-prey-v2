import { Redis } from "@upstash/redis";

// Per-patron marks in the email archive (/emails): what they've read and
// what they've starred. One Redis SET per patron per kind, keyed by
// member email, holding Kit ids. Kit ids rather than archive slugs,
// because a slug can shift (a hidden email, a duplicate subject) and the
// id never does.
//
//   read: set when the patron scrolls to an email's end, or by hand (the
//         circle on each row, the toggle under an email) for the ones
//         they already read in their inbox.
//   fav:  the star. Powers the index's Favorites filter.
//
// Server-side so both follow the patron from phone to desktop.

// Same shape as lib/guild.ts: an explicit override wins; otherwise
// production uses no prefix and every other environment writes into a
// `dev:` keyspace the live site never reads.
const KEY_PREFIX =
  process.env.EMAIL_ARCHIVE_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

export type MarkKind = "read" | "fav";

const markKey = (kind: MarkKind, email: string, prefix = KEY_PREFIX) =>
  `${prefix}emails:${kind}:${email.toLowerCase().trim()}`;

let cachedClient: Redis | null = null;
export function getArchiveRedis(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

/** Kit ids this patron has marked. Empty on any failure: unmarked is safe. */
export async function getMarkedKitIds(
  kind: MarkKind,
  email: string
): Promise<number[]> {
  const client = getArchiveRedis();
  if (!client) return [];
  try {
    const members = await client.smembers(markKey(kind, email));
    return members.map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

export async function setEmailMark(
  kind: MarkKind,
  email: string,
  kitId: number,
  on: boolean
): Promise<boolean> {
  const client = getArchiveRedis();
  if (!client) return false;
  try {
    if (on) await client.sadd(markKey(kind, email), String(kitId));
    else await client.srem(markKey(kind, email), String(kitId));
    return true;
  } catch {
    return false;
  }
}

export const getReadKitIds = (email: string) => getMarkedKitIds("read", email);

export type ReadKeyspace = "live" | "dev";

export function keyspacePrefix(keyspace: ReadKeyspace): string {
  return keyspace === "live" ? "" : "dev:";
}

export type MarkStats = {
  /** Kit id -> how many patrons have it marked. */
  counts: Map<number, number>;
  /** Patrons who have marked at least one email. */
  patrons: number;
};

/**
 * Aggregate counts for the admin "most read" view (/admin/emails).
 * Walks every patron's set of one kind and tallies by email; only the
 * totals leave this function, never who marked what. Read-only.
 *
 * Takes the keyspace explicitly rather than using KEY_PREFIX: /admin
 * only runs on localhost, where KEY_PREFIX is "dev:", but the numbers
 * Clay wants there are the live patrons'.
 */
export async function getMarkStats(
  kind: MarkKind,
  keyspace: ReadKeyspace
): Promise<MarkStats | null> {
  const client = getArchiveRedis();
  if (!client) return null;
  const pattern = `${markKey(kind, "", keyspacePrefix(keyspace))}*`;
  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const [next, batch]: [string | number, string[]] = await client.scan(
      cursor,
      { match: pattern, count: 1000 }
    );
    keys.push(...batch);
    cursor = next;
  } while (String(cursor) !== "0");

  const counts = new Map<number, number>();
  let patrons = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const pipe = client.pipeline();
    for (const key of keys.slice(i, i + 100)) pipe.smembers(key);
    const sets = (await pipe.exec()) as string[][];
    for (const members of sets) {
      if (!members?.length) continue;
      patrons += 1;
      for (const m of members) {
        const id = Number(m);
        if (Number.isFinite(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  return { counts, patrons };
}
