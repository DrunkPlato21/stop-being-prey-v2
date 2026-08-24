import { Redis } from "@upstash/redis";
import { getWritersDeskState } from "./writers-desk-state";
import { getRecentWorkEvents } from "./pulse";
import { getDeskPoolSignal } from "./pool";
import { countPostsSince } from "./lounge";
import {
  boutHref,
  listBouts,
  listTiles,
  tileTypeLabel,
  type ArenaCaseKind,
} from "./arena";
import { findMove } from "./arsenal";

// The weekly digest — the patron report. One email a week to every
// member, designed supporter-first: roughly half the membership never
// signs in, so their entire experience of the room is this email. It
// answers "what did my patronage produce this week," not "what did you
// miss in the Guild."
//
// The structural rule: the digest OBSERVES, it never demands. Every
// slot assembles from data that accrues on its own (desk status, room
// activity, wall signatures, the archive). Nothing here ever needs
// Clay to feed it on a schedule — a week where he is silent still
// sends a whole email, and a heads-down writing week leads with
// exactly that, which for a patron is the best possible news.
//
// The one hand-written slot is the CHAMBER: Clay can load a single
// "note to patrons" from /admin/desk whenever the mood strikes. The
// next digest to fire leads with it and consumes it. Empty chamber,
// the slot is silently omitted. One note at a time; loading again
// replaces it. (The desk status note is a different register — that
// one is ambient, for members who walk in. The chambered note is
// addressed.)
//
// Dev-namespaced like notifications.ts / coins.ts: production uses the
// live keyspace, everything else lands in `dev:` so local testing
// never touches real chamber state or real unsubscribes.
//
// Redis schema:
//   digest:chamber        JSON ChamberedNote (at most one)
//   digest:unsub          SET of member emails opted out
//   digest:run:<weekKey>  JSON DigestRun (idempotency + admin display)
//   digest:runs           ZSET, score=sentAt, member=weekKey

const KEY_PREFIX =
  process.env.DIGEST_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

// True only when Arena is reading the live register. Mirrors the prefix
// resolution in arena.ts — kept as a read-only check, never a write, so
// the two can't drift into disagreeing about which room is real.
const ARENA_IS_LIVE =
  (process.env.ARENA_KEY_PREFIX ??
    (process.env.NODE_ENV === "production" ? "" : "dev:")) === "";

const CHAMBER_KEY = `${KEY_PREFIX}digest:chamber`;
const UNSUB_KEY = `${KEY_PREFIX}digest:unsub`;
const RUN_PREFIX = `${KEY_PREFIX}digest:run:`;
const RUNS_INDEX = `${KEY_PREFIX}digest:runs`;

// Admin surfaces pass { prod: true } so chamber work done from a dev
// server lands in the LIVE chamber, same convention as the pool admin.
// Learned the hard way: the launch note was chambered from localhost on
// 2026-08-08, went to dev:digest:chamber, and Sunday's live send
// (correctly) found its own chamber empty. Admin intent is prod intent.
const chamberKeyFor = (prod?: boolean) =>
  prod ? "digest:chamber" : CHAMBER_KEY;
const runKeyFor = (weekKey: string, prod?: boolean) =>
  prod ? `digest:run:${weekKey}` : `${RUN_PREFIX}${weekKey}`;
const runsIndexFor = (prod?: boolean) => (prod ? "digest:runs" : RUNS_INDEX);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// How far back "shipped this week" looks. Slightly over seven days so
// a piece published right after last Sunday's send can't fall into the
// crack between two digests.
const SHIPPED_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

const CHAMBER_MAX_BODY = 1200;

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export type ChamberedNote = {
  body: string;
  loadedAt: number;
};

export type DigestRun = {
  weekKey: string;
  sentAt: number;
  attempted: number;
  sent: number;
  failed: number;
  unsubSkipped: number;
  noteConsumed: boolean;
};

export type DigestPayload = {
  weekKey: string;
  generatedAt: number;
  /** Chambered note body, or null when the chamber is empty. Assembly
      only peeks — consumption happens after a successful send. */
  note: string | null;
  /** Proof-of-work fallback when no note is chambered: whatever the
      desk itself says right now. */
  desk: {
    statusBody: string | null;
    awayNote: string | null;
    presence: "active" | "manually-away" | "auto-expired";
  };
  shipped: { label: string; title: string; url: string | null; at: number }[];
  rooms: {
    /** url is the thread deep link — the title renders as the link in
        the email, same convention as the shipped-work entries. */
    qotw: { title: string; replyCount: number; url: string } | null;
    latestThread: { title: string; replyCount: number; url: string } | null;
    /** Lounge posts written inside this digest's window — the week's
        pulse, not a moment-in-time presence count (which at Sunday
        5pm says nothing about the week). */
    loungePostsThisWeek: number;
  };
  wall: {
    title: string;
    contributorCount: number;
    totalRaisedCents: number;
    status: "active" | "closed";
  } | null;
  pool: { waiting: number; potCents: number };
  /** Every Arena case sealed inside this digest's window, in full —
      the email carries the whole filed case, not a teaser. The rule is
      dumb on purpose: sealed one, they get one; sealed none, the
      section vanishes. Oldest first so the numbers read forward. */
  cases: {
    id: string;
    title: string;
    /** Bout or post-mortem. The email needs it for the same two reasons
        the page does: the counter tile's label, and whether that tile
        carries Clay's "posted live" byline. */
    kind: ArenaCaseKind;
    caseNo: number | null;
    archetype: string | null;
    rulesApplied: string | null;
    /** Clay's one-line letter-voice opener from the seal form. */
    dispatch: string | null;
    sealedAt: number;
    url: string;
    tiles: {
      type: string;
      label: string;
      body: string;
      handle: string | null;
      transcript: string | null;
      imageUrl: string | null;
      /** Canonical tags resolved to display names; unnamed as typed. */
      moves: string[];
    }[];
  }[];
  /** Evergreen rotation so the email always has a floor, even on a
      week where every live slot came up empty. Carries the archetype
      so the email can present it as a real entry, not a bare link.
      Suppressed when fresh cases shipped — the floor isn't needed. */
  archive: {
    number: number;
    title: string;
    // Null when the filed case never got an archetype: the room does
    // not require one, so the email has to render without it.
    archetype: string | null;
    url: string;
  } | null;
};

function sanitizeChamberBody(input: string): string {
  // Same shape as the desk status: strip HTML brackets + C0 controls
  // (keep LF), collapse 3+ newlines, cap length.
  const noControl = input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "");
  return noControl.replace(/\n{3,}/g, "\n\n").trim().slice(0, CHAMBER_MAX_BODY);
}

function parseJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

/* === The chamber ==================================================== */

export async function getChamberedNote(
  opts?: { prod?: boolean }
): Promise<ChamberedNote | null> {
  const client = getClient();
  if (!client) return null;
  return parseJson<ChamberedNote>(await client.get(chamberKeyFor(opts?.prod)));
}

/**
 * Load (or replace) the one chambered note. Returns the stored record
 * or an error. Loading is always a full replace — one round in the
 * chamber, never a queue.
 */
export async function setChamberedNote(
  body: string,
  opts?: { prod?: boolean }
): Promise<
  | { ok: true; note: ChamberedNote }
  | { ok: false; error: "empty_body" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const clean = sanitizeChamberBody(body);
  if (!clean) return { ok: false, error: "empty_body" };
  const note: ChamberedNote = { body: clean, loadedAt: Date.now() };
  await client.set(chamberKeyFor(opts?.prod), JSON.stringify(note));
  return { ok: true, note };
}

export async function clearChamberedNote(
  opts?: { prod?: boolean }
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.del(chamberKeyFor(opts?.prod));
}

/**
 * Consume the chambered note after a successful send. When
 * `expectedBody` is passed, the chamber is only cleared if it still
 * holds that exact note — a note Clay loaded mid-send survives for
 * next week instead of being silently discarded unread.
 */
export async function consumeChamberedNote(
  expectedBody?: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (expectedBody !== undefined) {
    const current = parseJson<ChamberedNote>(await client.get(CHAMBER_KEY));
    if (!current || current.body !== expectedBody) return;
  }
  await client.del(CHAMBER_KEY);
}

/* === Unsubscribe ===================================================== */

export async function setDigestUnsubscribed(
  email: string,
  unsubscribed: boolean
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = email.toLowerCase().trim();
  if (!norm) return;
  if (unsubscribed) await client.sadd(UNSUB_KEY, norm);
  else await client.srem(UNSUB_KEY, norm);
}

export async function listDigestUnsubscribed(): Promise<Set<string>> {
  const client = getClient();
  if (!client) return new Set();
  const raw = (await client.smembers(UNSUB_KEY).catch(() => [])) as unknown[];
  return new Set(
    raw.filter((v): v is string => typeof v === "string")
  );
}

/* === Runs (idempotency + admin display) ============================== */

export function weekKeyFor(now: number = Date.now()): string {
  return `wk${Math.floor(now / WEEK_MS)}`;
}

/**
 * Claim this week's run. SET NX so a double-fire (Vercel retry, manual
 * re-run) finds the claim and bails instead of double-emailing every
 * member. Returns false when the week is already claimed.
 */
export async function claimWeeklyRun(weekKey: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const placeholder: DigestRun = {
    weekKey,
    sentAt: Date.now(),
    attempted: 0,
    sent: 0,
    failed: 0,
    unsubSkipped: 0,
    noteConsumed: false,
  };
  const res = await client.set(`${RUN_PREFIX}${weekKey}`, JSON.stringify(placeholder), {
    nx: true,
  });
  return res === "OK";
}

export async function finishWeeklyRun(run: DigestRun): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${RUN_PREFIX}${run.weekKey}`, JSON.stringify(run));
  await client.zadd(RUNS_INDEX, { score: run.sentAt, member: run.weekKey });
}

export async function getLastRun(
  opts?: { prod?: boolean }
): Promise<DigestRun | null> {
  const client = getClient();
  if (!client) return null;
  const keys = (await client.zrange(runsIndexFor(opts?.prod), 0, 0, {
    rev: true,
  })) as string[];
  if (!keys.length) return null;
  return parseJson<DigestRun>(
    await client.get(runKeyFor(keys[0], opts?.prod))
  );
}

/* === Schedule ======================================================== */

// Sunday 21:00 UTC — late Sunday afternoon in the US, the natural
// "week in review" hour. Must agree with the vercel.json cron entry.
export function nextDigestFireAt(now: number = Date.now()): number {
  const d = new Date(now);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21, 0, 0)
  );
  const dow = target.getUTCDay();
  let add = (7 - dow) % 7;
  if (add === 0 && target.getTime() <= now) add = 7;
  target.setUTCDate(target.getUTCDate() + add);
  return target.getTime();
}

/* === Assembly ======================================================== */

/**
 * Assemble the digest from what the site already knows. Read-only:
 * peeks at the chamber without consuming it (the cron consumes after a
 * successful send; the admin preview never consumes at all).
 */
export async function assembleDigest(
  now: number = Date.now()
): Promise<DigestPayload> {
  // The window opens where the last send closed, so a piece published
  // minutes after one digest can't fall in the crack before the next,
  // and a piece published minutes before one can't be reported twice.
  // First run ever (or after a long gap) falls back to the fixed window.
  const lastRun = await getLastRun();
  const since =
    lastRun && now - lastRun.sentAt <= SHIPPED_WINDOW_MS * 2
      ? lastRun.sentAt
      : now - SHIPPED_WINDOW_MS;

  const [state, work, chamber, poolSignal, loungePostsThisWeek, boutsOnFile] =
    await Promise.all([
      getWritersDeskState(),
      getRecentWorkEvents({ limit: 12 }),
      getChamberedNote(),
      getDeskPoolSignal().catch(() => ({ waiting: 0, note: null, potCents: 0 })),
      countPostsSince(since).catch(() => 0),
      // Deep read on purpose: the index ranks by lastTileAt and sealing
      // never bumps that score, so a dormant bout sealed this week (or
      // an old filed case the rotation should still reach) would fall
      // out of a shallow window as the room grows.
      listBouts(200).catch(() => []),
    ]);

  // The email is a PRODUCTION artifact even when a dev server builds it.
  // The admin chamber and the test send both run from localhost, where
  // arena.ts is still pointed at its dev: keyspace — full of invented
  // seed cases (scripts/arena-seed-dev.mjs). The chamber reads prod for
  // everything else, so without this the preview offers a real audience
  // a fight that never happened. Only the live register rides the email:
  // off the prod keyspace, the room contributes nothing.
  const allBouts = ARENA_IS_LIVE ? boutsOnFile : [];

  // Every case sealed inside the window rides the email in full,
  // oldest first so the case numbers read forward. Specimen tiles show
  // the screenshot OR the transcript, never both (the email renderer
  // decides); moves resolve to their Arsenal display names.
  const sealedThisWeek = allBouts
    .filter(
      (b) =>
        b.status === "sealed" &&
        b.sealedAt !== null &&
        b.sealedAt >= since &&
        b.sealedAt <= now
    )
    .sort((a, b) => (a.sealedAt ?? 0) - (b.sealedAt ?? 0));
  const cases: DigestPayload["cases"] = [];
  for (const bout of sealedThisWeek) {
    const tiles = await listTiles(bout.id);
    cases.push({
      id: bout.id,
      title: bout.title,
      kind: bout.kind,
      caseNo: bout.caseNo,
      archetype: bout.archetype,
      rulesApplied: bout.rulesApplied,
      dispatch: bout.dispatch,
      sealedAt: bout.sealedAt ?? now,
      url: boutHref(bout),
      tiles: tiles.map((t) => ({
        type: t.type,
        label: tileTypeLabel(t.type, bout.kind),
        body: t.body,
        handle: t.handle,
        transcript: t.transcript,
        imageUrl: t.imageUrl,
        moves: t.moves.map((m) => findMove(m)?.name ?? m),
      })),
    });
  }

  // Shipped this week: site content only (essays, issues, field notes,
  // case files), inside the window. Social-echo sources stay out — the
  // digest reports the work, not the noise around it.
  const siteSources = new Set(["essay", "issue", "field-note", "case-file"]);
  const shipped = work
    .filter((e) => siteSources.has(e.source) && e.at >= since && e.at <= now)
    .map((e) => ({ label: e.label, title: e.body, url: e.link ?? null, at: e.at }));

  // Archive rotation: on a week with no fresh case, the email reaches
  // back for one already on file. Deterministic by week so every member
  // sees the same pick and a retry can't shuffle it. It rotates the
  // ROOM's filed cases: the old markdown archive keeps its own
  // numbering and is no longer part of the site, so pulling from it
  // would put two different "Case 003"s in front of the same reader.
  const filed = allBouts
    .filter((b) => b.status === "sealed" && b.caseNo !== null)
    .sort((a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0));
  let archive: DigestPayload["archive"] = null;
  if (filed.length > 0 && cases.length === 0) {
    const pick = filed[Math.floor(now / WEEK_MS) % filed.length];
    archive = {
      number: pick.caseNo ?? 0,
      title: pick.title,
      archetype: pick.archetype,
      url: boutHref(pick),
    };
  }

  return {
    weekKey: weekKeyFor(now),
    generatedAt: now,
    note: chamber?.body ?? null,
    desk: {
      statusBody: state.latestUpdate?.body ?? null,
      awayNote: state.awayNote,
      presence: state.state,
    },
    shipped,
    rooms: {
      qotw: state.rooms.guild.questionOfWeek
        ? {
            title: state.rooms.guild.questionOfWeek.title,
            replyCount: state.rooms.guild.questionOfWeek.replyCount,
            url: `/guild/${state.rooms.guild.questionOfWeek.id}`,
          }
        : null,
      latestThread: state.rooms.guild.latest
        ? {
            title: state.rooms.guild.latest.title,
            replyCount: state.rooms.guild.latest.replyCount,
            url: `/guild/${state.rooms.guild.latest.id}`,
          }
        : null,
      loungePostsThisWeek,
    },
    wall: state.activeWall
      ? {
          title: state.activeWall.title,
          contributorCount: state.activeWall.contributorCount,
          totalRaisedCents: state.activeWall.totalRaisedCents,
          status: state.activeWall.status,
        }
      : null,
    pool: { waiting: poolSignal.waiting, potCents: poolSignal.potCents },
    cases,
    archive,
  };
}
