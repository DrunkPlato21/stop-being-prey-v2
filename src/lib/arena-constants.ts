// Arena constants with no server dependencies, importable by client
// components (the bench) without dragging Redis/crypto into the bundle.
// Same split as guild-constants.ts. Server consumers get these
// re-exported from lib/arena.ts.

export const ARENA_MAX_TITLE = 120;
export const ARENA_MAX_ARCHETYPE = 80;
export const ARENA_MAX_RULES = 120;
export const ARENA_MAX_BODY = 8000;
export const ARENA_MAX_TRANSCRIPT = 8000;
export const ARENA_MAX_HANDLE = 60;
export const ARENA_MAX_WHISPER = 1200;
export const ARENA_MAX_MOVES = 4;
export const ARENA_MAX_MOVE_LEN = 60;

/** Case numbers render zero-padded, continuing the 001-006 archive. */
export function caseNoStr(n: number): string {
  return String(n).padStart(3, "0");
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
