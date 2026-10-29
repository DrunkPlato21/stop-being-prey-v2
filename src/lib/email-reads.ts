import { Redis } from "@upstash/redis";

// Per-patron read state for the email archive (/emails). One Redis SET
// per patron, keyed by member email, holding the Kit ids of the emails
// they've read. Kit ids rather than archive slugs, because a slug can
// shift (a hidden email, a duplicate subject) and the id never does.
//
// An email is marked read when the patron scrolls to its end, or by hand
// (the check on each row, or the toggle at the foot of an email) for the
// ones they already read in their inbox. Server-side so it follows them
// from phone to desktop.

// Same shape as lib/guild.ts: an explicit override wins; otherwise
// production uses no prefix and every other environment writes into a
// `dev:` keyspace the live site never reads.
const KEY_PREFIX =
  process.env.EMAIL_ARCHIVE_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

const readKey = (email: string) =>
  `${KEY_PREFIX}emails:read:${email.toLowerCase().trim()}`;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

/** Kit ids this patron has read. Empty on any failure: unread is safe. */
export async function getReadKitIds(email: string): Promise<number[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const members = await client.smembers(readKey(email));
    return members.map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

export async function setEmailRead(
  email: string,
  kitId: number,
  read: boolean
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    if (read) await client.sadd(readKey(email), String(kitId));
    else await client.srem(readKey(email), String(kitId));
    return true;
  } catch {
    return false;
  }
}
