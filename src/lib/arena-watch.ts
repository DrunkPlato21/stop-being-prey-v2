import { Redis } from "@upstash/redis";

// Who has asked to hear about the Arena, and how loudly.
//
// Two separate things, deliberately:
//
//   Room subscription  "tell me when a fight starts". Standing, opt-in,
//                      email. A fight is an event: it happens, the live
//                      window is 12 hours, and then it is over. The bell
//                      already announces it, but a bell only reaches
//                      someone already on the site, which is exactly the
//                      person who does not need telling.
//
//   Bout follow        "tell me how this one ends". Scoped to one open
//                      bout, opted into by someone who is reading it
//                      live. A sealed case is a document — it keeps, and
//                      the Sunday digest carries it — so it does not
//                      deserve a standing broadcast. It deserves a
//                      finishing note to the people who watched.
//
// Both are OFF by default and only ever turn on from a deliberate click.
// The in-app bell fan-out in arena-notify.ts is untouched and still goes
// to every member: that is in-app, not email, and the consent rule that
// matters here is about the inbox.
//
// The key prefix is re-derived rather than imported from arena.ts, the
// same way digest.ts re-derives it. Local dev writes a `dev:` keyspace
// the live site never reads, so a subscription made on localhost is not
// a subscription in production. Whoever changes the prefix rule in
// arena.ts has to change it here and in digest.ts too.
const KEY_PREFIX =
  process.env.ARENA_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

/** SET of emails subscribed to live-fight email. */
const SUBSCRIBERS_KEY = `${KEY_PREFIX}arena:subscribers`;
/** Presence of this key means a live email went out recently. */
const LIVE_COOLDOWN_KEY = `${KEY_PREFIX}arena:live-email-sent`;
/** SET of emails following one bout to its seal. */
const followersKey = (boutId: string) =>
  `${KEY_PREFIX}arena:bout:${boutId}:followers`;

// A follow is only good until the bout seals, and a deleted bout takes
// its answer with it. Rather than reach into deleteBout to clean up, the
// set simply ages out: nothing reads a dead bout's followers, so an
// orphan is inert, and six months outlives any fight.
const FOLLOWERS_TTL_SECONDS = 180 * 24 * 60 * 60;

// At most one live-fight email per day, whatever happens in the room.
// A fight that opens, stalls and reopens must not mail the list twice,
// and a week with four bouts is a week with one alert.
export const ARENA_LIVE_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

/* === Room subscription ===================================== */

export async function isArenaSubscribed(email: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const member = await client
    .sismember(SUBSCRIBERS_KEY, normEmail(email))
    .catch(() => 0);
  return member === 1;
}

/** Idempotent both ways. Returns the state it settled on. */
export async function setArenaSubscribed(
  email: string,
  on: boolean
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const e = normEmail(email);
  if (!e) return false;
  if (on) await client.sadd(SUBSCRIBERS_KEY, e);
  else await client.srem(SUBSCRIBERS_KEY, e);
  return on;
}

export async function listArenaSubscribers(): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const members = await client
    .smembers<string[]>(SUBSCRIBERS_KEY)
    .catch(() => [] as string[]);
  return Array.isArray(members) ? members.filter(Boolean) : [];
}

export async function arenaSubscriberCount(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  return (await client.scard(SUBSCRIBERS_KEY).catch(() => 0)) ?? 0;
}

/* === Per-bout follow ======================================= */

export async function isFollowingBout(
  boutId: string,
  email: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const member = await client
    .sismember(followersKey(boutId), normEmail(email))
    .catch(() => 0);
  return member === 1;
}

export async function setBoutFollow(
  boutId: string,
  email: string,
  on: boolean
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const e = normEmail(email);
  if (!e) return false;
  const key = followersKey(boutId);
  if (on) {
    await client.sadd(key, e);
    // Refreshed on every follow rather than set once, so a long fight
    // cannot outlive its own follower list.
    await client.expire(key, FOLLOWERS_TTL_SECONDS).catch(() => null);
  } else {
    await client.srem(key, e);
  }
  return on;
}

export async function listBoutFollowers(boutId: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const members = await client
    .smembers<string[]>(followersKey(boutId))
    .catch(() => [] as string[]);
  return Array.isArray(members) ? members.filter(Boolean) : [];
}

export async function boutFollowerCount(boutId: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  return (await client.scard(followersKey(boutId)).catch(() => 0)) ?? 0;
}

/* === Frequency cap ========================================= */

/**
 * Claim the right to send today's live-fight email. True exactly once
 * per cooldown window, for whoever asks first.
 *
 * SET NX with an expiry, so the claim is atomic and cleans itself up —
 * two tiles landing at the same instant cannot both win, and a crash
 * after claiming costs one skipped alert rather than a stuck lock.
 */
export async function claimLiveEmailSlot(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const claimed = await client
    .set(LIVE_COOLDOWN_KEY, Date.now(), {
      nx: true,
      px: ARENA_LIVE_EMAIL_COOLDOWN_MS,
    })
    .catch(() => null);
  return claimed === "OK";
}

/** Undo a claim whose send then failed, so the next tile can retry. */
export async function releaseLiveEmailSlot(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.del(LIVE_COOLDOWN_KEY).catch(() => null);
}
