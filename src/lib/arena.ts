import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { isReactionKey, type ReactionKey } from "./lounge";

// The Arena — Clay's combat surface. A bout is a fight being broken down
// in public: a chronological sequence of typed tiles (specimen, read,
// counter, result, verdict) that Clay alone authors. Members never post
// publicly here; their input is per-tile reactions (wordless, public)
// and per-tile whispers (private to Clay). A bout is open while the
// breakdown is developing, then sealed — the sealed bout is the case
// file's raw anatomy. Workshop, not colosseum: no real-time machinery,
// navigation/refresh is the update surface, same stance as the Guild.
//
// Prototype scope (feat/arena-prototype): no images yet (specimen is
// transcript-first; the Blob pipeline joins later), no alert emails, no
// case-file export on seal. Those are settled patterns, added when the
// format has proven itself.

// Storage is dev-namespaced from day one, same shape as guild.ts: local
// `npm run dev` writes a `dev:` keyspace the live site never reads.
const KEY_PREFIX =
  process.env.ARENA_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

// ZSET of bout ids, score = lastTileAt, so the index reads newest-active
// first without fetching every bout.
const BOUTS_INDEX = `${KEY_PREFIX}arena:bouts`;
const BOUT_PREFIX = `${KEY_PREFIX}arena:bout:`;
const TILE_PREFIX = `${KEY_PREFIX}arena:tile:`;
// Per-bout ZSET of tile ids, score = createdAt (chronological — the
// tile order IS the bout's meaning).
const boutTilesKey = (boutId: string) => `${BOUT_PREFIX}${boutId}:tiles`;
// Per-tile HASH reaction key -> count, plus a per-(tile, reaction) SET of
// member emails so a member can't double-react and can un-react.
const tileReactsKey = (tileId: string) => `${TILE_PREFIX}${tileId}:reacts`;
const tileReactedKey = (tileId: string, key: ReactionKey) =>
  `${TILE_PREFIX}${tileId}:reacted:${key}`;
// Per-tile LIST of whisper JSON, newest last. Private: only the admin
// surfaces read this, ever. Whispers are the member's voice TO Clay; the
// room hears them only if he quotes one into a later tile.
const tileWhispersKey = (tileId: string) => `${TILE_PREFIX}${tileId}:whispers`;

export const ARENA_MAX_TITLE = 120;
export const ARENA_MAX_BODY = 8000;
export const ARENA_MAX_TRANSCRIPT = 8000;
export const ARENA_MAX_HANDLE = 60;
export const ARENA_MAX_WHISPER = 1200;
export const ARENA_MAX_MOVES = 4;
export const ARENA_MAX_MOVE_LEN = 60;

// The tile grammar. Order in a bout is free — real fights don't follow a
// script — but the types are fixed because they are the case-file
// anatomy: what happened, what it was, what Clay did, what came of it,
// what it teaches.
export const TILE_TYPES = [
  "specimen",
  "read",
  "counter",
  "result",
  "verdict",
] as const;
export type ArenaTileType = (typeof TILE_TYPES)[number];

export function isTileType(value: unknown): value is ArenaTileType {
  return (
    typeof value === "string" &&
    (TILE_TYPES as readonly string[]).includes(value)
  );
}

export const TILE_TYPE_LABEL: Record<ArenaTileType, string> = {
  specimen: "The Specimen",
  read: "The Read",
  counter: "The Counter",
  result: "The Result",
  verdict: "The Verdict",
};

export type ArenaBout = {
  id: string;
  title: string;
  status: "open" | "sealed";
  createdAt: number;
  sealedAt: number | null;
  lastTileAt: number;
  tileCount: number;
};

export type ArenaTile = {
  id: string;
  boutId: string;
  type: ArenaTileType;
  body: string;
  // Specimen extras: the opponent's handle (as Clay chooses to render
  // it — often withheld) and the durable transcript. Tweets get deleted;
  // the transcript is the record.
  handle: string | null;
  transcript: string | null;
  // Move names tagged on this tile. Free text in the prototype; becomes
  // taxonomy ids when the Arsenal is real.
  moves: string[];
  createdAt: number;
};

export type ArenaWhisper = {
  email: string;
  body: string;
  createdAt: number;
};

export type TileReactions = {
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey[];
};

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------
// Bouts
// --------------------------------------------------------------------

export async function createBout(title: string): Promise<ArenaBout | null> {
  const client = getClient();
  const clean = title.trim().slice(0, ARENA_MAX_TITLE);
  if (!client || !clean) return null;
  const now = Date.now();
  const bout: ArenaBout = {
    id: randomUUID(),
    title: clean,
    status: "open",
    createdAt: now,
    sealedAt: null,
    lastTileAt: now,
    tileCount: 0,
  };
  await client.set(`${BOUT_PREFIX}${bout.id}`, JSON.stringify(bout));
  await client.zadd(BOUTS_INDEX, { score: now, member: bout.id });
  return bout;
}

export async function getBout(id: string): Promise<ArenaBout | null> {
  const client = getClient();
  if (!client) return null;
  return parse<ArenaBout>(await client.get(`${BOUT_PREFIX}${id}`));
}

async function saveBout(bout: ArenaBout): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${BOUT_PREFIX}${bout.id}`, JSON.stringify(bout));
}

/** Newest-active first. */
export async function listBouts(limit = 30): Promise<ArenaBout[]> {
  const client = getClient();
  if (!client) return [];
  const ids = await client.zrange<string[]>(BOUTS_INDEX, 0, limit - 1, {
    rev: true,
  });
  const bouts = await Promise.all(ids.map((id) => getBout(id)));
  return bouts.filter((b): b is ArenaBout => b !== null);
}

export async function setBoutStatus(
  id: string,
  status: "open" | "sealed"
): Promise<ArenaBout | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.status = status;
  bout.sealedAt = status === "sealed" ? Date.now() : null;
  await saveBout(bout);
  return bout;
}

// --------------------------------------------------------------------
// Tiles
// --------------------------------------------------------------------

export async function addTile(
  boutId: string,
  input: {
    type: ArenaTileType;
    body: string;
    handle?: string | null;
    transcript?: string | null;
    moves?: string[];
  }
): Promise<ArenaTile | null> {
  const client = getClient();
  const bout = await getBout(boutId);
  const body = input.body.trim().slice(0, ARENA_MAX_BODY);
  if (!client || !bout || !body) return null;

  const now = Date.now();
  const tile: ArenaTile = {
    id: randomUUID(),
    boutId,
    type: input.type,
    body,
    handle: input.handle?.trim().slice(0, ARENA_MAX_HANDLE) || null,
    transcript: input.transcript?.trim().slice(0, ARENA_MAX_TRANSCRIPT) || null,
    moves: (input.moves ?? [])
      .map((m) => m.trim().slice(0, ARENA_MAX_MOVE_LEN))
      .filter(Boolean)
      .slice(0, ARENA_MAX_MOVES),
    createdAt: now,
  };
  await client.set(`${TILE_PREFIX}${tile.id}`, JSON.stringify(tile));
  await client.zadd(boutTilesKey(boutId), { score: now, member: tile.id });
  bout.lastTileAt = now;
  bout.tileCount += 1;
  await saveBout(bout);
  await client.zadd(BOUTS_INDEX, { score: now, member: boutId });
  return tile;
}

export async function getTile(id: string): Promise<ArenaTile | null> {
  const client = getClient();
  if (!client) return null;
  return parse<ArenaTile>(await client.get(`${TILE_PREFIX}${id}`));
}

/** Chronological — the bout as it unfolded. */
export async function listTiles(boutId: string): Promise<ArenaTile[]> {
  const client = getClient();
  if (!client) return [];
  const ids = await client.zrange<string[]>(boutTilesKey(boutId), 0, -1);
  const tiles = await Promise.all(ids.map((id) => getTile(id)));
  return tiles.filter((t): t is ArenaTile => t !== null);
}

// --------------------------------------------------------------------
// Reactions (public, wordless, per tile)
// --------------------------------------------------------------------

export async function toggleReaction(
  tileId: string,
  email: string,
  key: string
): Promise<TileReactions | null> {
  const client = getClient();
  if (!client || !isReactionKey(key)) return null;
  const setKey = tileReactedKey(tileId, key);
  const already = await client.sismember(setKey, email);
  if (already) {
    await client.srem(setKey, email);
    await client.hincrby(tileReactsKey(tileId), key, -1);
  } else {
    await client.sadd(setKey, email);
    await client.hincrby(tileReactsKey(tileId), key, 1);
  }
  return getTileReactions(tileId, email);
}

export async function getTileReactions(
  tileId: string,
  email: string | null
): Promise<TileReactions> {
  const client = getClient();
  if (!client) return { counts: {}, mine: [] };
  const raw =
    (await client.hgetall<Record<string, string | number>>(
      tileReactsKey(tileId)
    )) ?? {};
  const counts: Partial<Record<ReactionKey, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (isReactionKey(k) && n > 0) counts[k] = n;
  }
  const mine: ReactionKey[] = [];
  if (email) {
    await Promise.all(
      (Object.keys(counts) as ReactionKey[]).map(async (k) => {
        if (await client.sismember(tileReactedKey(tileId, k), email))
          mine.push(k);
      })
    );
  }
  return { counts, mine };
}

// --------------------------------------------------------------------
// Whispers (private, per tile, Clay's eyes only)
// --------------------------------------------------------------------

export async function addWhisper(
  tileId: string,
  email: string,
  body: string
): Promise<boolean> {
  const client = getClient();
  const clean = body.trim().slice(0, ARENA_MAX_WHISPER);
  if (!client || !clean) return false;
  const whisper: ArenaWhisper = { email, body: clean, createdAt: Date.now() };
  await client.rpush(tileWhispersKey(tileId), JSON.stringify(whisper));
  return true;
}

/** Admin-only read. Callers must gate on isAdmin BEFORE calling. */
export async function listWhispers(tileId: string): Promise<ArenaWhisper[]> {
  const client = getClient();
  if (!client) return [];
  const raw = await client.lrange<string>(tileWhispersKey(tileId), 0, -1);
  return raw
    .map((r) => parse<ArenaWhisper>(r))
    .filter((w): w is ArenaWhisper => w !== null);
}
