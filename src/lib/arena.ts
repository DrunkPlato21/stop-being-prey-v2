import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { isReactionKey, type ReactionKey } from "./lounge";
import { findMove } from "./arsenal";

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
// Per-tile HASH member email -> reaction key. One reaction per member
// per tile, Facebook semantics: picking a new one replaces, picking the
// same one removes. Counts are aggregated from this hash on read — a
// tile's reaction volume is small, so one HGETALL beats maintaining
// parallel counters that can drift.
const tileReactedByKey = (tileId: string) =>
  `${TILE_PREFIX}${tileId}:reactedby`;
// Per-tile LIST of whisper JSON, newest last. Private: only the admin
// surfaces read this, ever. Whispers are the member's voice TO Clay; the
// room hears them only if he quotes one into a later tile.
const tileWhispersKey = (tileId: string) => `${TILE_PREFIX}${tileId}:whispers`;
// Per-move ZSET of bout ids, score = last time the move was tagged in
// that bout. This is the Arsenal's accretion: a move's page lists every
// bout it has appeared in, newest first, fed automatically by tagging.
const moveBoutsKey = (slug: string) => `${KEY_PREFIX}arena:move:${slug}:bouts`;

// Limits + the tile grammar live in arena-constants.ts (no server deps)
// so the client bench can import them; re-exported here for lib
// consumers, same split as the Guild's.
export {
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_BODY,
  ARENA_MAX_HANDLE,
  ARENA_MAX_MOVE_LEN,
  ARENA_MAX_MOVES,
  ARENA_MAX_RULES,
  ARENA_MAX_TITLE,
  ARENA_MAX_TRANSCRIPT,
  ARENA_MAX_WHISPER,
  isTileType,
  TILE_TYPE_LABEL,
  TILE_TYPES,
  type ArenaTileType,
} from "./arena-constants";
import {
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_BODY,
  ARENA_MAX_HANDLE,
  ARENA_MAX_MOVE_LEN,
  ARENA_MAX_MOVES,
  ARENA_MAX_RULES,
  ARENA_MAX_TITLE,
  ARENA_MAX_TRANSCRIPT,
  ARENA_MAX_WHISPER,
  type ArenaTileType,
} from "./arena-constants";

export type ArenaBout = {
  id: string;
  title: string;
  status: "open" | "sealed";
  createdAt: number;
  sealedAt: number | null;
  lastTileAt: number;
  tileCount: number;
  // Case-file stamp, assigned at seal time. Sealing IS filing: the
  // sealed bout is the case file, there is no second document. The
  // number continues the published sequence (the old markdown files
  // hold 001-006, so fresh bouts start at 007). Reopening a bout keeps
  // the stamp so a re-seal doesn't retype it.
  caseNo: number | null;
  archetype: string | null;
  rulesApplied: string | null;
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
  // Pasted screenshot (Ctrl+V in the bench), resized client-side and
  // stored in our Blob store. Any tile type may carry one; the specimen
  // usually does.
  imageUrl: string | null;
  createdAt: number;
};

export type ArenaWhisper = {
  email: string;
  body: string;
  createdAt: number;
};

export type TileReactions = {
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey | null;
};

// Only tile images from our own Blob store render; same rule as the
// Lounge and Guild, so a crafted URL can't make the site hotlink
// arbitrary hosts.
const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i;

function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && BLOB_HOST_RE.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

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
    caseNo: null,
    archetype: null,
    rulesApplied: null,
  };
  await client.set(`${BOUT_PREFIX}${bout.id}`, JSON.stringify(bout));
  await client.zadd(BOUTS_INDEX, { score: now, member: bout.id });
  return bout;
}

export async function getBout(id: string): Promise<ArenaBout | null> {
  const client = getClient();
  if (!client) return null;
  const bout = parse<ArenaBout>(await client.get(`${BOUT_PREFIX}${id}`));
  if (!bout) return null;
  // Bouts written before the case-file stamp existed lack the fields.
  bout.caseNo = bout.caseNo ?? null;
  bout.archetype = bout.archetype ?? null;
  bout.rulesApplied = bout.rulesApplied ?? null;
  return bout;
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

/**
 * Seal = file. The stamp (number, archetype, rules) lands with the seal;
 * from here the bout reads as a case file. Passing caseNo null keeps an
 * existing stamp's number (the re-seal path).
 */
export async function sealBout(
  id: string,
  stamp: {
    caseNo: number | null;
    archetype?: string | null;
    rulesApplied?: string | null;
  }
): Promise<ArenaBout | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.status = "sealed";
  bout.sealedAt = Date.now();
  bout.caseNo =
    stamp.caseNo && Number.isInteger(stamp.caseNo) && stamp.caseNo > 0
      ? stamp.caseNo
      : bout.caseNo;
  bout.archetype =
    stamp.archetype?.trim().slice(0, ARENA_MAX_ARCHETYPE) ||
    bout.archetype ||
    null;
  bout.rulesApplied =
    stamp.rulesApplied?.trim().slice(0, ARENA_MAX_RULES) ||
    bout.rulesApplied ||
    null;
  await saveBout(bout);
  return bout;
}

/** Reopen keeps the case-file stamp; only the status changes. */
export async function reopenBout(id: string): Promise<ArenaBout | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.status = "open";
  bout.sealedAt = null;
  await saveBout(bout);
  return bout;
}

// The old markdown archive holds cases 001-006; fresh bouts continue
// the sequence.
const FIRST_CASE_NO = 7;

/** Default number for the next seal: one past the highest on file. */
export async function nextCaseNo(): Promise<number> {
  const bouts = await listBouts(200);
  const top = Math.max(
    FIRST_CASE_NO - 1,
    ...bouts.map((b) => b.caseNo ?? 0)
  );
  return top + 1;
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
    imageUrl?: string | null;
  }
): Promise<ArenaTile | null> {
  const client = getClient();
  const bout = await getBout(boutId);
  const body = input.body.trim().slice(0, ARENA_MAX_BODY);
  // A sealed bout is a filed case: reopen it to add tiles.
  if (!client || !bout || bout.status !== "open" || !body) return null;

  const now = Date.now();
  const tile: ArenaTile = {
    id: randomUUID(),
    boutId,
    type: input.type,
    body,
    handle: input.handle?.trim().slice(0, ARENA_MAX_HANDLE) || null,
    transcript: input.transcript?.trim().slice(0, ARENA_MAX_TRANSCRIPT) || null,
    // Canonical tags normalize to their Arsenal slug (whether typed as
    // slug or full name); anything else stays as typed = unnamed move.
    moves: (input.moves ?? [])
      .map((m) => m.trim().slice(0, ARENA_MAX_MOVE_LEN))
      .filter(Boolean)
      .map((m) => findMove(m)?.slug ?? m)
      .filter((m, i, all) => all.indexOf(m) === i)
      .slice(0, ARENA_MAX_MOVES),
    imageUrl: sanitizeImageUrl(input.imageUrl),
    createdAt: now,
  };
  await client.set(`${TILE_PREFIX}${tile.id}`, JSON.stringify(tile));
  await client.zadd(boutTilesKey(boutId), { score: now, member: tile.id });
  // Feed the Arsenal: each canonical move remembers this bout.
  for (const m of tile.moves) {
    if (findMove(m)) {
      await client.zadd(moveBoutsKey(findMove(m)!.slug), {
        score: now,
        member: boutId,
      });
    }
  }
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

/**
 * How many bouts each move has been tagged in. The Arsenal's visibility
 * rule reads straight off the record: a move is public the first time
 * Clay tags it in a bout, never before. Read-side truth (ZCARD per
 * move) so there is no debut flag to manage or drift.
 */
export async function getMoveBoutCounts(
  slugs: string[]
): Promise<Record<string, number>> {
  const client = getClient();
  const counts: Record<string, number> = {};
  if (!client) return counts;
  const cards = await Promise.all(
    slugs.map((slug) => client.zcard(moveBoutsKey(slug)).catch(() => 0))
  );
  slugs.forEach((slug, i) => {
    counts[slug] = typeof cards[i] === "number" ? cards[i] : 0;
  });
  return counts;
}

/** Bouts a move has appeared in, newest tag first. The Arsenal page's
    "seen in the record" list. */
export async function listBoutsForMove(slug: string): Promise<ArenaBout[]> {
  const client = getClient();
  if (!client) return [];
  const ids = await client.zrange<string[]>(moveBoutsKey(slug), 0, 29, {
    rev: true,
  });
  const bouts = await Promise.all(ids.map((id) => getBout(id)));
  return bouts.filter((b): b is ArenaBout => b !== null);
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

/**
 * Facebook semantics: one reaction per member per tile. A new key
 * replaces the old one; passing the member's current key (or null)
 * removes it.
 */
export async function setMyReaction(
  tileId: string,
  email: string,
  key: string | null
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const hashKey = tileReactedByKey(tileId);
  if (key === null || !isReactionKey(key)) {
    await client.hdel(hashKey, email);
    return;
  }
  const current = await client.hget<string>(hashKey, email);
  if (current === key) {
    await client.hdel(hashKey, email);
  } else {
    await client.hset(hashKey, { [email]: key });
  }
}

export async function getTileReactions(
  tileId: string,
  email: string | null
): Promise<TileReactions> {
  const client = getClient();
  if (!client) return { counts: {}, mine: null };
  const raw =
    (await client.hgetall<Record<string, string>>(tileReactedByKey(tileId))) ??
    {};
  const counts: Partial<Record<ReactionKey, number>> = {};
  let mine: ReactionKey | null = null;
  for (const [member, k] of Object.entries(raw)) {
    if (!isReactionKey(k)) continue;
    counts[k] = (counts[k] ?? 0) + 1;
    if (email && member === email) mine = k;
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
