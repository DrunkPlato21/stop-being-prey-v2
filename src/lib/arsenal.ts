import movesJson from "./arsenal-moves.json";

// The Arsenal: the canonical move taxonomy, snapshotted from one-shot-db
// by scripts/pull-arsenal.py. The Library is canon; this file only reads
// the snapshot. No server deps on purpose — the bench (client) needs the
// list for its type-ahead picker, same split as arena-constants.
//
// Two roles, and they carry the chip color grammar everywhere:
//   opponent -> rust (their move, Part II: How the Predators Work)
//   clay     -> gold (his technique, Part III: How to Stop Falling for It)
// A tag with no entry here renders as an unnamed move (faint ink): real,
// spotted in the wild, not yet coined into the Library.

export type MoveRole = "opponent" | "clay";

export type ArsenalMove = {
  slug: string;
  name: string;
  role: MoveRole;
  definition: string;
  mechanism: string;
  counterMove: string;
  status: string;
  source: string;
};

export const ARSENAL_MOVES = movesJson as ArsenalMove[];

const BY_SLUG = new Map(ARSENAL_MOVES.map((m) => [m.slug, m]));
const BY_NAME = new Map(ARSENAL_MOVES.map((m) => [m.name.toLowerCase(), m]));

/** The Library's own slug rule, restated here so a move coined in the
    heat of a fight lands on the same key its Library entry will use
    when it is finally written. Verified against every entry in the
    snapshot: lowercase, any run of non-alphanumerics becomes a single
    hyphen, ends trimmed. ("The $10 paywall" -> "the-10-paywall".) */
export function moveSlug(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Look a tag up by slug first, then by exact name (case-insensitive),
    so tags typed before the picker existed still resolve. Last resort
    is the slug of whatever was typed, which is what lights a chip up
    the day a move Clay had been tagging by hand joins the Library -
    "Burden shuffle", "burden shuffle" and "burden-shuffle" all land on
    the same entry. */
export function findMove(tag: string): ArsenalMove | null {
  const t = tag.trim();
  return (
    BY_SLUG.get(t) ??
    BY_NAME.get(t.toLowerCase()) ??
    BY_SLUG.get(moveSlug(t)) ??
    null
  );
}

export const MOVE_ROLE_LABEL: Record<MoveRole, string> = {
  opponent: "How the predators work",
  clay: "How to stop falling for it",
};
