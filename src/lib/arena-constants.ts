// Arena constants with no server dependencies, importable by client
// components (the bench) without dragging Redis/crypto into the bundle.
// Same split as guild-constants.ts. Server consumers get these
// re-exported from lib/arena.ts.

export const ARENA_MAX_TITLE = 120;
export const ARENA_MAX_ARCHETYPE = 80;
export const ARENA_MAX_RULES = 120;
export const ARENA_MAX_DISPATCH = 280;
export const ARENA_MAX_BODY = 8000;
export const ARENA_MAX_TRANSCRIPT = 8000;
export const ARENA_MAX_HANDLE = 60;
export const ARENA_MAX_WHISPER = 1200;
export const ARENA_MAX_MOVES = 4;
export const ARENA_MAX_MOVE_LEN = 60;
/** Source links are pasted from the wild — share URLs carry long
    tracking tails — so the cap is generous. It exists to stop a bad
    paste from becoming a megabyte, not to police the shape. */
export const ARENA_MAX_SOURCE_URL = 500;

/** An open bout wears LIVE (pulse) while its newest tile is inside
    this window, plain OPEN after. Time-honest: never a stale LIVE. */
export const ARENA_LIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** The canonical link for a bout: the readable slug once a seal has
    minted one, the raw id until then. Lives here, not in arena.ts, so
    client surfaces (the Desk door) can link a bout without pulling
    Redis into the bundle. Every surface goes through it, so a filed
    case is never advertised by its uuid. */
export function boutHref(bout: { id: string; slug?: string | null }): string {
  return `/arena/${bout.slug ?? bout.id}`;
}

/** Case numbers render zero-padded (001, 002...). The room's own
    sequence, from 001: the old /case-files page keeps its separate
    numbering and stays up for reference only. */
export function caseNoStr(n: number): string {
  return String(n).padStart(3, "0");
}

/** Armory numerals are Roman (MOVE I, MOVE IV) so they read as a
    different register than case numbers and can't be confused. */
export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

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

// What kind of fight the case is. A bout is one Clay was in. A
// post-mortem is a public exchange between other people, dissected
// after the fact. Same lifecycle, same tiles, same case numbers, same
// seal — the kind changes only how the case is framed on the page:
// the label a tile wears, whether the counter is attributed to Clay
// as something he posted live, and whether The Record is allowed to
// call it live. It is a presentation flag, never a state.
export const CASE_KINDS = ["bout", "post_mortem"] as const;
export type ArenaCaseKind = (typeof CASE_KINDS)[number];

export function isCaseKind(value: unknown): value is ArenaCaseKind {
  return (
    typeof value === "string" &&
    (CASE_KINDS as readonly string[]).includes(value)
  );
}

/** How a case type names itself where the room has to say it out loud.
    "bout" is deliberately absent from the UI: it is the default and the
    overwhelming majority, so labelling it would add chrome to every
    existing case to distinguish the rare one. Only the post-mortem
    announces itself. */
export const CASE_KIND_LABEL: Record<ArenaCaseKind, string> = {
  bout: "Bout",
  post_mortem: "Post-mortem",
};

// Tile labels that differ in a post-mortem. Sparse on purpose: it is an
// override map, not a second grammar. The specimen is still the
// specimen and the read is still the read, because those describe the
// exchange, which happened either way. Only the counter changes, and it
// changes because in a bout it is the line Clay threw and in a
// post-mortem it is the line nobody did.
const POST_MORTEM_TILE_LABEL: Partial<Record<ArenaTileType, string>> = {
  counter: "The Counter They Missed",
};

/** The label a tile wears, given the kind of case it sits in. Every
    surface that prints a tile heading goes through this, so the bout
    page, the bench and the Sunday digest can never drift apart. */
export function tileTypeLabel(
  type: ArenaTileType,
  kind: ArenaCaseKind = "bout"
): string {
  if (kind === "post_mortem") {
    return POST_MORTEM_TILE_LABEL[type] ?? TILE_TYPE_LABEL[type];
  }
  return TILE_TYPE_LABEL[type];
}

/** Whether a counter tile carries the "Clay - posted live" byline. Only
    a bout earns it: in a post-mortem Clay was not in the room, and the
    counter is the one that was never thrown. */
export function showsPostedLive(kind: ArenaCaseKind = "bout"): boolean {
  return kind === "bout";
}
