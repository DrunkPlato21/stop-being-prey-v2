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
