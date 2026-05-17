import { Redis } from "@upstash/redis";
import { getAllCaseFiles } from "@/lib/case-files";
import { getAllFieldNotesWithActivity } from "@/lib/field-notes";
import { getLastViewed as getLoungeLastViewed } from "@/lib/lounge";

// Per-section "new content since you were last here" indicators for the
// members-area left nav. Three sections carry a dot today:
//
//   case-files   — fires when any case file's publish date is newer
//                  than the member's last visit to /case-files.
//   field-notes  — fires when any field note's lastActivityAt (latest
//                  journal entry or its own meta.date) is newer than
//                  the member's last visit to /notes/field-notes.
//   lounge       — fires when the newest post-or-reply activity time
//                  is newer than `lounge:lastviewed:<email>`. The
//                  lounge page already maintains setLastViewed on
//                  every render so we just read here.
//
// Storage: per-member per-section "lastViewed" epoch ms strings under
// `nav:viewed:<section>:<email>`. Lounge reuses its existing
// `lounge:lastviewed:<email>` (no need to duplicate). Bumping happens
// when the member loads the section's page (see markNavViewed).

const NAV_VIEWED_PREFIX = "nav:viewed:";

type DottedSection = "case-files" | "field-notes";

export type NavDotState = {
  caseFiles: boolean;
  fieldNotes: boolean;
  lounge: boolean;
};

const EMPTY: NavDotState = {
  caseFiles: false,
  fieldNotes: false,
  lounge: false,
};

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function getCaseFilesLatestAt(): Promise<number> {
  // getAllCaseFiles is sorted highest-number-first, not by date — but
  // case file numbers track publish order so #1 → #N has dates that
  // generally march forward. Take the max of every entry's date so a
  // backfilled older case file can't shadow a newer one's signal.
  const files = getAllCaseFiles();
  let latest = 0;
  for (const f of files) {
    const ms = Date.parse(f.date);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest;
}

async function getFieldNotesLatestAt(): Promise<number> {
  // getAllFieldNotesWithActivity already returns entries sorted by
  // lastActivityAt desc, so [0] is the freshest.
  const notes = await getAllFieldNotesWithActivity();
  return notes[0]?.lastActivityAt ?? 0;
}

async function getLoungeLatestActivityAt(): Promise<number> {
  // The lounge re-scores POSTS_INDEX on every reply (see createReply in
  // lib/lounge.ts), so the highest score across the zset is the
  // wall-clock time of the most recent post-or-reply anywhere. One
  // zrange call with rev + withScores is all we need.
  const client = getClient();
  if (!client) return 0;
  const result = await client
    .zrange("lounge:posts", 0, 0, { rev: true, withScores: true })
    .catch(() => null);
  if (!Array.isArray(result) || result.length < 2) return 0;
  // Upstash returns [member, score, member, score, ...] when withScores
  // is true. We asked for one entry, so result[1] is the score.
  const score = Number(result[1]);
  return Number.isFinite(score) ? score : 0;
}

async function getNavViewed(
  email: string,
  section: DottedSection
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const value = await client
    .get<string | number>(`${NAV_VIEWED_PREFIX}${section}:${email}`)
    .catch(() => null);
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the dot state for the current member. Anonymous viewers and
 * missing-creds environments degrade to "no dots" so the nav still
 * renders cleanly.
 */
export async function getNavDots(
  email: string | null
): Promise<NavDotState> {
  if (!email) return EMPTY;
  const e = normEmail(email);

  const [
    caseFilesAt,
    fieldNotesAt,
    loungeAt,
    viewedCaseFiles,
    viewedFieldNotes,
    viewedLounge,
  ] = await Promise.all([
    getCaseFilesLatestAt(),
    getFieldNotesLatestAt(),
    getLoungeLatestActivityAt(),
    getNavViewed(e, "case-files"),
    getNavViewed(e, "field-notes"),
    getLoungeLastViewed(e).catch(() => null),
  ]);

  return {
    caseFiles: caseFilesAt > viewedCaseFiles,
    fieldNotes: fieldNotesAt > viewedFieldNotes,
    lounge: loungeAt > (viewedLounge ?? 0),
  };
}

/**
 * Record that the member has now seen this section. Called from each
 * section's index/detail page on render. Idempotent and cheap — single
 * Redis SET with the current epoch ms.
 */
export async function markNavViewed(
  section: DottedSection,
  email: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const key = `${NAV_VIEWED_PREFIX}${section}:${normEmail(email)}`;
  await client.set(key, Date.now()).catch(() => null);
}
