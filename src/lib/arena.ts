import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { unstable_cache } from "next/cache";
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
// The armory register: ZSET slug -> first-tag timestamp, written NX so
// the debut moment is permanent. Debut order assigns each move its
// stamped numeral (MOVE I, MOVE II, ...) on the Arsenal wall.
const ARSENAL_DEBUTS_KEY = `${KEY_PREFIX}arena:arsenal:debuts`;
// slug -> bout id. Minted at seal so a filed case has a readable URL
// (the shared link is the conversion asset; a raw uuid says nothing and
// carries no words a search engine can read).
const slugKey = (slug: string) => `${KEY_PREFIX}arena:slug:${slug}`;
// HASH case number -> bout id, claimed with HSETNX. The register is what
// makes a case number unique: two bouts can never wear the same stamp,
// and a re-seal of the same bout keeps its own.
const CASE_NOS_KEY = `${KEY_PREFIX}arena:casenos`;
// Every slug a bout has ever answered to. A rename keeps the old one
// working (a link that shipped in a digest has to keep resolving), so
// deleting the bout has to know about all of them.
const boutSlugsKey = (id: string) => `${BOUT_PREFIX}${id}:slugs`;

// Limits + the tile grammar live in arena-constants.ts (no server deps)
// so the client bench can import them; re-exported here for lib
// consumers, same split as the Guild's.
export {
  boutHref,
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_BODY,
  ARENA_MAX_DISPATCH,
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
  boutHref,
  ARENA_MAX_ARCHETYPE,
  ARENA_MAX_BODY,
  ARENA_MAX_DISPATCH,
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
  // One optional line in Clay's letter voice, written at seal time: how
  // the fight found him. The Sunday digest opens the case with it — the
  // difference between a record retrieved and a note from the desk.
  dispatch: string | null;
  // Bell fan-out guards: set once when the fight is announced (first
  // tile) and when the filed case is announced (first seal), so a
  // reopen-and-reseal never rings twice.
  announcedAt: number | null;
  sealAnnouncedAt: number | null;
  // Bumped on every change to the bout or its tiles. The watching
  // room polls this one number: a post, a fix and a delete all move
  // it, so a browser can tell "something changed" from one cheap read
  // instead of re-rendering the whole page to find out.
  updatedAt: number;
  // Readable URL for the filed case, minted once at seal and never
  // changed after (a link that has been shared has to keep working).
  // Null while the bout is open: an unsealed fight has no public face.
  slug: string | null;
  // Promotional unlock: a sealed bout Clay has made publicly readable
  // (the conversion asset — one finished fight as the free sample).
  // Only ever honored on sealed bouts; reopening takes it private
  // again automatically because the gate checks status too.
  publicAt: number | null;
  // Every move tagged anywhere in the bout, first-tagged order. Kept
  // in step by the tile writes so the index can dress a case plate
  // with its chips from the one bout read it already does, instead of
  // fetching every tile of every case on the shelf.
  moves: string[];
};

/** What a seal returns: the filed bout, plus the number Clay asked for
    when the register had to hand him a different one. */
export type SealResult = {
  bout: ArenaBout;
  renumberedFrom: number | null;
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
  // Our own static assets, served from /public. The old case-file
  // archive's screenshots live there, so an imported case can show its
  // exhibit without re-uploading a file the repo already ships. Kept
  // strict: one leading slash, no protocol, no traversal.
  if (/^\/assets\/[A-Za-z0-9/_-]+\.(png|jpe?g|webp|gif)$/i.test(raw)) {
    return raw;
  }
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
    dispatch: null,
    announcedAt: null,
    sealAnnouncedAt: null,
    updatedAt: now,
    slug: null,
    publicAt: null,
    moves: [],
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
  bout.dispatch = bout.dispatch ?? null;
  bout.announcedAt = bout.announcedAt ?? null;
  bout.sealAnnouncedAt = bout.sealAnnouncedAt ?? null;
  bout.slug = bout.slug ?? null;
  bout.updatedAt = bout.updatedAt ?? bout.lastTileAt;
  bout.publicAt = bout.publicAt ?? null;
  bout.moves = bout.moves ?? [];
  return bout;
}

async function saveBout(bout: ArenaBout): Promise<void> {
  const client = getClient();
  if (!client) return;
  // Every mutation lands here, so this is the one honest place to move
  // the version marker the watching room polls.
  bout.updatedAt = Date.now();
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

/** Title -> url word. ASCII, hyphenated, no trailing junk, capped so a
    long title can't make a link that wraps twice. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Mint (once) the readable slug for a bout. Idempotent: a bout that
 * already has one keeps it, because the shared link has to keep
 * working. Uniqueness is claimed with SET NX, so two fights with the
 * same title get `-2`, `-3`. Falls back to the id when a title has no
 * usable letters at all (an emoji-only title, say).
 */
async function mintSlug(
  bout: ArenaBout,
  { force = false }: { force?: boolean } = {}
): Promise<string | null> {
  const client = getClient();
  if (!client) return bout.slug;
  if (bout.slug && !force) return bout.slug;
  const base = slugify(bout.title);
  if (!base) return null;
  for (let n = 1; n <= 20; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const claimed = await client.set(slugKey(candidate), bout.id, { nx: true });
    if (claimed) {
      await client.sadd(boutSlugsKey(bout.id), candidate);
      return candidate;
    }
    // Our own claim from an earlier attempt: take it back.
    const owner = await client.get<string>(slugKey(candidate));
    if (owner === bout.id) {
      await client.sadd(boutSlugsKey(bout.id), candidate);
      return candidate;
    }
  }
  return null;
}

/** Resolve a bout by its readable slug, or null. */
async function getBoutBySlug(slug: string): Promise<ArenaBout | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(slugKey(slug));
  return id ? getBout(id) : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bout page's resolver: the route param is either the raw id (how
    members reach an open bout) or the minted slug (how a filed case is
    shared). A uuid can only be an id, so that path is one lookup. A
    word could be either, because ids are only uuids by convention (the
    dev seed hands out readable ones), so a slug miss falls back to an
    id read before giving up. */
export async function getBoutByParam(param: string): Promise<ArenaBout | null> {
  const clean = param.trim();
  if (!clean) return null;
  if (UUID_RE.test(clean)) return getBout(clean);
  return (await getBoutBySlug(clean)) ?? getBout(clean);
}

/**
 * Claim a case number for a bout. HSETNX makes it atomic: the first
 * bout to ask for a number owns it. Returns true when the number is
 * this bout's (including a re-seal asking for the one it already
 * holds), false when another case is already stamped with it.
 */
async function claimCaseNo(n: number, boutId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return true;
  const won = await client.hsetnx(CASE_NOS_KEY, String(n), boutId);
  if (won) return true;
  const owner = await client.hget<string>(CASE_NOS_KEY, String(n));
  return owner === boutId;
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
    dispatch?: string | null;
  }
): Promise<SealResult | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.status = "sealed";
  bout.sealedAt = Date.now();

  // The number is the spine of the archive, so it is claimed, not
  // typed. Asked-for number first (or the one this bout already
  // wears); if another case owns it, walk forward to the first free
  // one and report the swap so the seal never lands silently on a
  // different stamp than the one Clay typed.
  const wanted =
    stamp.caseNo && Number.isInteger(stamp.caseNo) && stamp.caseNo > 0
      ? stamp.caseNo
      : bout.caseNo ?? (await nextCaseNo());
  let assigned = wanted;
  if (!(await claimCaseNo(assigned, bout.id))) {
    assigned = await nextCaseNo();
    for (let i = 0; i < 50 && !(await claimCaseNo(assigned, bout.id)); i += 1) {
      assigned += 1;
    }
  }
  bout.caseNo = assigned;

  bout.archetype =
    stamp.archetype?.trim().slice(0, ARENA_MAX_ARCHETYPE) ||
    bout.archetype ||
    null;
  bout.rulesApplied =
    stamp.rulesApplied?.trim().slice(0, ARENA_MAX_RULES) ||
    bout.rulesApplied ||
    null;
  bout.dispatch =
    stamp.dispatch?.trim().slice(0, ARENA_MAX_DISPATCH) ||
    bout.dispatch ||
    null;
  bout.slug = await mintSlug(bout);
  await saveBout(bout);
  return { bout, renumberedFrom: assigned === wanted ? null : wanted };
}

/** Wall-clock time of the newest tile anywhere in the Arena (the bouts
    index is scored by lastTileAt), for the nav's new-since-last-visit
    dot. 0 when the room is empty or unconfigured. */
export async function getArenaLatestActivityAt(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const result = await client
    .zrange<(string | number)[]>(BOUTS_INDEX, 0, 0, {
      rev: true,
      withScores: true,
    })
    .catch(() => null);
  if (!Array.isArray(result) || result.length < 2) return 0;
  const score = Number(result[1]);
  return Number.isFinite(score) ? score : 0;
}

/** Stamp announcement guards after a bell fan-out. */
export async function setBoutFlags(
  id: string,
  flags: { announcedAt?: number; sealAnnouncedAt?: number }
): Promise<void> {
  const bout = await getBout(id);
  if (!bout) return;
  if (flags.announcedAt !== undefined) bout.announcedAt = flags.announcedAt;
  if (flags.sealAnnouncedAt !== undefined) {
    bout.sealAnnouncedAt = flags.sealAnnouncedAt;
  }
  await saveBout(bout);
}

/**
 * Edit a filed case's stamp: its title, number, archetype, rules and
 * dispatch line. The case file is a document Clay maintains, so every
 * part of the cover has to be correctable without unsealing anything.
 *
 * Two things are handled carefully. A changed number is re-claimed in
 * the register (and the old one released) so uniqueness still holds.
 * A changed title mints a new readable link, but the OLD link keeps
 * resolving: it may already have shipped in a Sunday digest, and a
 * dead link in a sent email is not fixable afterwards.
 */
export async function updateBoutStamp(
  id: string,
  stamp: {
    title?: string | null;
    caseNo?: number | null;
    archetype?: string | null;
    rulesApplied?: string | null;
    dispatch?: string | null;
  }
): Promise<SealResult | null> {
  const client = getClient();
  const bout = await getBout(id);
  if (!client || !bout) return null;

  const title = stamp.title?.trim().slice(0, ARENA_MAX_TITLE);
  const renamed = Boolean(title) && title !== bout.title;
  if (title) bout.title = title;

  let renumberedFrom: number | null = null;
  const wanted = stamp.caseNo;
  if (
    wanted &&
    Number.isInteger(wanted) &&
    wanted > 0 &&
    wanted !== bout.caseNo
  ) {
    if (await claimCaseNo(wanted, bout.id)) {
      if (bout.caseNo != null) {
        await client.hdel(CASE_NOS_KEY, String(bout.caseNo));
      }
      bout.caseNo = wanted;
    } else {
      // Taken by another case. Keep the number it already wears and
      // say so, rather than silently moving it somewhere free.
      renumberedFrom = wanted;
    }
  }

  bout.archetype =
    stamp.archetype === undefined
      ? bout.archetype
      : stamp.archetype?.trim().slice(0, ARENA_MAX_ARCHETYPE) || null;
  bout.rulesApplied =
    stamp.rulesApplied === undefined
      ? bout.rulesApplied
      : stamp.rulesApplied?.trim().slice(0, ARENA_MAX_RULES) || null;
  bout.dispatch =
    stamp.dispatch === undefined
      ? bout.dispatch
      : stamp.dispatch?.trim().slice(0, ARENA_MAX_DISPATCH) || null;

  if (renamed && bout.slug) {
    bout.slug = (await mintSlug(bout, { force: true })) ?? bout.slug;
  } else if (renamed && bout.status === "sealed") {
    bout.slug = await mintSlug(bout);
  }
  await saveBout(bout);
  return { bout, renumberedFrom };
}

/**
 * Delete a bout and everything hanging off it: its tiles, their
 * reactions and whispers, its place in the index and on every move's
 * wall, every slug it answered to, and its claim on a case number
 * (which becomes free again). Returns the tiles' screenshots so the
 * caller can clean up any blobs. There is no undo, which is why the
 * button that calls it asks twice.
 */
export async function deleteBout(
  id: string
): Promise<{ imageUrls: string[] } | null> {
  const client = getClient();
  const bout = await getBout(id);
  if (!client || !bout) return null;

  const tiles = await listTiles(id);
  const imageUrls: string[] = [];
  for (const tile of tiles) {
    if (tile.imageUrl) imageUrls.push(tile.imageUrl);
    await client.del(`${TILE_PREFIX}${tile.id}`);
    await client.del(tileReactedByKey(tile.id));
    await client.del(tileWhispersKey(tile.id));
  }
  await client.del(boutTilesKey(id));

  // Off every move's wall. The bout is gone, so this is unconditional.
  const tagged = new Set(tiles.flatMap((t) => t.moves));
  for (const tag of tagged) {
    const move = findMove(tag);
    if (move) await client.zrem(moveBoutsKey(move.slug), id);
  }

  const slugs = await client.smembers(boutSlugsKey(id)).catch(() => []);
  for (const slug of [...slugs, bout.slug].filter(Boolean) as string[]) {
    const owner = await client.get<string>(slugKey(slug));
    if (owner === id) await client.del(slugKey(slug));
  }
  await client.del(boutSlugsKey(id));

  if (bout.caseNo != null) {
    const owner = await client.hget<string>(CASE_NOS_KEY, String(bout.caseNo));
    if (owner === id) await client.hdel(CASE_NOS_KEY, String(bout.caseNo));
  }

  await client.zrem(BOUTS_INDEX, id);
  await client.del(`${BOUT_PREFIX}${id}`);
  return { imageUrls };
}

/** Reopen keeps the case-file stamp; only the status changes. The
    public unlock is cleared — an open fight is never public. */
export async function reopenBout(id: string): Promise<ArenaBout | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.status = "open";
  bout.sealedAt = null;
  bout.publicAt = null;
  await saveBout(bout);
  return bout;
}

/** Promotional unlock toggle. Only sealed bouts can go public. */
export async function setBoutPublic(
  id: string,
  isPublic: boolean
): Promise<ArenaBout | null> {
  const bout = await getBout(id);
  if (!bout) return null;
  bout.publicAt = isPublic && bout.status === "sealed" ? Date.now() : null;
  // Sealed before slugs existed: mint one now rather than publish a
  // uuid. Harmless no-op for anything sealed since.
  if (bout.publicAt && !bout.slug) bout.slug = await mintSlug(bout);
  await saveBout(bout);
  return bout;
}

/** The gate the bout page checks for anonymous readers. */
export function isBoutPublic(bout: ArenaBout): boolean {
  return bout.status === "sealed" && bout.publicAt !== null;
}

// The room keeps its own sequence, starting at 001. The old markdown
// archive has its own numbering and is no longer part of the site; it
// stays on disk for reference only, so the two never have to agree.
const FIRST_CASE_NO = 1;

/** Default number for the next seal: one past the highest on file.
    Reads the claim register as well as the bouts, so a number that was
    claimed by a case now out of the index is never handed out twice. */
export async function nextCaseNo(): Promise<number> {
  const client = getClient();
  const [bouts, claimed] = await Promise.all([
    listBouts(200),
    client
      ? client
          .hkeys(CASE_NOS_KEY)
          .catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ]);
  const top = Math.max(
    FIRST_CASE_NO - 1,
    ...bouts.map((b) => b.caseNo ?? 0),
    ...claimed.map((k) => Number.parseInt(k, 10) || 0)
  );
  return top + 1;
}

// --------------------------------------------------------------------
// Tiles
// --------------------------------------------------------------------

/** Tags as they get stored: trimmed, canonicalized to Arsenal slugs
    where they name a known move, deduped, capped. */
function normalizeMoves(moves: string[] | undefined): string[] {
  return (moves ?? [])
    .map((m) => m.trim().slice(0, ARENA_MAX_MOVE_LEN))
    .filter(Boolean)
    .map((m) => findMove(m)?.slug ?? m)
    .filter((m, i, all) => all.indexOf(m) === i)
    .slice(0, ARENA_MAX_MOVES);
}

/** Feed the Arsenal: each canonical move remembers this bout, and the
    register records its debut (NX: only the first tag ever counts). */
async function indexMoves(
  boutId: string,
  moves: string[],
  now: number
): Promise<void> {
  const client = getClient();
  if (!client) return;
  for (const m of moves) {
    const move = findMove(m);
    if (!move) continue;
    await client.zadd(moveBoutsKey(move.slug), { score: now, member: boutId });
    await client.zadd(
      ARSENAL_DEBUTS_KEY,
      { nx: true },
      { score: now, member: move.slug }
    );
  }
}

/**
 * The other half of the Arsenal's bookkeeping, needed the moment tiles
 * became editable: a tag pulled off a tile has to leave the move's
 * "seen in the record" list too, but ONLY if no other tile in the bout
 * still carries it. The debut stamp is deliberately left alone. It is
 * the date the move was first spotted, and that stays true whatever
 * happens to the tile afterwards; a move with no bouts left simply
 * drops off the wall, which is the same read-side rule as before.
 */
async function unindexMoves(
  boutId: string,
  removed: string[]
): Promise<void> {
  const client = getClient();
  if (!client || removed.length === 0) return;
  const canonical = removed
    .map((m) => findMove(m)?.slug)
    .filter((m): m is string => Boolean(m));
  if (canonical.length === 0) return;
  const remaining = new Set(
    (await listTiles(boutId)).flatMap((t) => t.moves)
  );
  for (const slug of canonical) {
    if (remaining.has(slug)) continue;
    await client.zrem(moveBoutsKey(slug), boutId);
  }
}

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
    moves: normalizeMoves(input.moves),
    imageUrl: sanitizeImageUrl(input.imageUrl),
    createdAt: now,
  };
  await client.set(`${TILE_PREFIX}${tile.id}`, JSON.stringify(tile));
  await client.zadd(boutTilesKey(boutId), { score: now, member: tile.id });
  await indexMoves(boutId, tile.moves, now);
  bout.lastTileAt = now;
  bout.tileCount += 1;
  bout.moves = [...new Set([...bout.moves, ...tile.moves])];
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
 * Edit a posted tile. Live in a fight is exactly where typos happen,
 * so the bench can rewrite a tile in place: everything the composer
 * sets is editable, and the tile keeps its id and its createdAt, so
 * the order of the bout (which IS its meaning) never shifts under an
 * edit. Sealed cases are fixable too. The record is Clay's to keep
 * accurate, and making him reopen a filed case to fix a typo would
 * just mean the typo stays. Adding a NEW tile still needs a reopen:
 * that changes what the case says, which is a different act.
 */
export async function updateTile(
  tileId: string,
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
  const tile = await getTile(tileId);
  if (!client || !tile) return null;
  const bout = await getBout(tile.boutId);
  if (!bout) return null;
  const body = input.body.trim().slice(0, ARENA_MAX_BODY);
  if (!body) return null;

  const before = tile.moves;
  const moves = normalizeMoves(input.moves);
  const updated: ArenaTile = {
    ...tile,
    type: input.type,
    body,
    handle: input.handle?.trim().slice(0, ARENA_MAX_HANDLE) || null,
    transcript: input.transcript?.trim().slice(0, ARENA_MAX_TRANSCRIPT) || null,
    moves,
    imageUrl: sanitizeImageUrl(input.imageUrl),
  };
  await client.set(`${TILE_PREFIX}${tile.id}`, JSON.stringify(updated));
  // A fix changes what the room is reading, so the version marker has
  // to move even though no counter did. The chip aggregate recomputes
  // from the record: an edit can add or drop tags.
  bout.moves = [
    ...new Set((await listTiles(tile.boutId)).flatMap((t) => t.moves)),
  ];
  await saveBout(bout);
  // Arsenal bookkeeping both ways: new tags join the move's record,
  // dropped tags leave it unless another tile still carries them.
  await indexMoves(tile.boutId, moves, tile.createdAt);
  await unindexMoves(
    tile.boutId,
    before.filter((m) => !moves.includes(m))
  );
  return updated;
}

/**
 * Delete a tile, filed case included (same reasoning as updateTile).
 * Returns it so the caller can clean up its screenshot. The bout's
 * counters are recomputed from the record rather than decremented, so
 * the index score (and the LIVE window that reads it) stays honest
 * after a deletion. Reactions and whispers on the tile go with it:
 * they were about a tile that no longer exists.
 */
export async function deleteTile(tileId: string): Promise<ArenaTile | null> {
  const client = getClient();
  const tile = await getTile(tileId);
  if (!client || !tile) return null;
  const bout = await getBout(tile.boutId);
  if (!bout) return null;

  await client.zrem(boutTilesKey(tile.boutId), tile.id);
  await client.del(`${TILE_PREFIX}${tile.id}`);
  await client.del(tileReactedByKey(tile.id));
  await client.del(tileWhispersKey(tile.id));
  await unindexMoves(tile.boutId, tile.moves);

  const remaining = await listTiles(tile.boutId);
  bout.tileCount = remaining.length;
  bout.moves = [...new Set(remaining.flatMap((t) => t.moves))];
  bout.lastTileAt =
    remaining.length > 0
      ? remaining[remaining.length - 1].createdAt
      : bout.createdAt;
  await saveBout(bout);
  await client.zadd(BOUTS_INDEX, { score: bout.lastTileAt, member: bout.id });
  return tile;
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

/**
 * Slugs in debut order — the armory register that assigns each move its
 * stamped numeral. Self-heals: a move that has bouts on record but no
 * register entry (tagged before the register existed) gets one from its
 * oldest bout score, written NX so the order stays permanent.
 */
export async function getArsenalDebutOrder(
  countedSlugs: string[]
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  let order = await client.zrange<string[]>(ARSENAL_DEBUTS_KEY, 0, -1);
  const missing = countedSlugs.filter((s) => !order.includes(s));
  for (const slug of missing) {
    const first = await client.zrange<(string | number)[]>(
      moveBoutsKey(slug),
      0,
      0,
      { withScores: true }
    );
    const score = typeof first?.[1] === "number" ? first[1] : Date.now();
    await client.zadd(
      ARSENAL_DEBUTS_KEY,
      { nx: true },
      { score, member: slug }
    );
  }
  if (missing.length > 0) {
    order = await client.zrange<string[]>(ARSENAL_DEBUTS_KEY, 0, -1);
  }
  return order;
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

// --------------------------------------------------------------------
// The public read path
// --------------------------------------------------------------------

/** One tag covers every cached public case: only Clay writes here, so
    a blanket bust on any authoring action is both correct and simpler
    than tracking which case a slug belonged to. */
export const ARENA_PUBLIC_TAG = "arena-public";

export type PublicBoutView = {
  bout: ArenaBout;
  tiles: ArenaTile[];
  reactions: TileReactions[];
};

/**
 * A public case, read through the data cache. This is the one Arena
 * page anonymous traffic can reach, which makes it the one that gets
 * crawled, scraped and shared into hostile timelines. Uncached, each
 * of those hits cost a bout read, a tile read per tile and a reaction
 * read per tile; now a burst of readers costs that once per window.
 * Members never come through here (they get the live read, reactions
 * included), and any authoring action busts the tag.
 */
export async function getPublicBoutView(
  param: string
): Promise<PublicBoutView | null> {
  return unstable_cache(
    async (key: string): Promise<PublicBoutView | null> => {
      const bout = await getBoutByParam(key);
      if (!bout || !isBoutPublic(bout)) return null;
      const tiles = await listTiles(bout.id);
      const reactions = await Promise.all(
        tiles.map((t) => getTileReactions(t.id, null))
      );
      return { bout, tiles, reactions };
    },
    ["arena-public-bout"],
    { revalidate: 300, tags: [ARENA_PUBLIC_TAG] }
  )(param);
}

/** The one number a watching browser polls: bumped by every post, fix,
    delete and seal. One Redis read, no tiles, no reactions. */
export async function getBoutVersion(id: string): Promise<number | null> {
  const bout = await getBout(id);
  return bout ? bout.updatedAt : null;
}
