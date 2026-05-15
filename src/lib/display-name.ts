// Display name rules — reserved list, profanity filter, normalization,
// and the default-name disambiguator used at signup.
//
// Normalization is what makes the checks robust against the obvious
// bypass tricks: ASCII-folding (diacritics stripped), lowercasing,
// leetspeak collapse (1→i, 3→e, 4→a, 0→o, 5→s, 7→t, @→a, $→s), and
// removal of every character that isn't a letter so spacing /
// punctuation can't smuggle a reserved or slur through.
//
// Reserved + profanity checks both run against the normalized form.
// Profanity uses substring match so "n1gger123" still trips.
// Reserved uses a whole-string match (after normalization) so legitimate
// names that happen to contain a reserved token aren't blocked.

/* === Reserved names ======================================== */

// Whole-string match, case + diacritic insensitive, leetspeak-folded.
// Includes the publication name, role titles, and impersonation-prone
// public figures whose ideas overlap this audience.
const RESERVED_NAMES: readonly string[] = [
  "clay",
  "author",
  "admin",
  "moderator",
  "system",
  "founder",
  "stopbeingprey",
  "stop being prey",
  "thomas sowell",
  "sowell",
  "donald trump",
  "trump",
  "charlie kirk",
  "curtis yarvin",
  "yarvin",
  "scott adams",
  "tucker carlson",
  "michael malice",
  "tom woods",
  "dave smith",
];

/* === Profanity list ======================================== */

// Substring match (post-normalization). Deliberately small — only
// unambiguous English slurs. Borderline cases route to admin review
// via flaggedForReview rather than a hard block. We don't reach for an
// npm profanity package: the catalogues are noisy and most have
// hundreds of false-positive-prone entries.
//
// Encoded as base64 so the source file isn't an obvious slur dump on
// casual reads. Decoded once at module load; the runtime check uses the
// plain strings.
const SLUR_TOKENS_B64: readonly string[] = [
  "bmlnZ2Vy",
  "bmlnZ2E=",
  "ZmFnZ290",
  "ZHlrZQ==",
  "Y2hpbms=",
  "Z29vaw==",
  "a2lrZQ==",
  "c3BpYw==",
  "d2V0YmFjaw==",
  "dHJhbm55",
  "cmV0YXJk",
  "Y3VudA==",
  "Y29vbg==",
  "amlnYWJvbw==",
];

let cachedSlurs: string[] | null = null;
function slurTokens(): string[] {
  if (cachedSlurs) return cachedSlurs;
  cachedSlurs = SLUR_TOKENS_B64.map((b64) =>
    Buffer.from(b64, "base64").toString("utf8")
  );
  return cachedSlurs;
}

// Borderline tokens trigger flaggedForReview rather than a hard block.
// Same encoding scheme. The dispatcher returns "borderline" so the
// caller can write the audit flag and still let the name through.
const BORDERLINE_TOKENS_B64: readonly string[] = [
  "YXNzaG9sZQ==",
  "Yml0Y2g=",
  "YmFzdGFyZA==",
  "ZHVtYmFzcw==",
  "bmF6aQ==",
  "aGl0bGVy",
];

let cachedBorderline: string[] | null = null;
function borderlineTokens(): string[] {
  if (cachedBorderline) return cachedBorderline;
  cachedBorderline = BORDERLINE_TOKENS_B64.map((b64) =>
    Buffer.from(b64, "base64").toString("utf8")
  );
  return cachedBorderline;
}

/* === Normalization ========================================= */

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

/**
 * Reduce a name to a canonical form for reserved + profanity checks.
 * Strips diacritics (NFD + combining-mark removal), lowercases, folds
 * leetspeak, then drops every character that isn't an ASCII letter.
 * The result is one continuous lowercase-letter string.
 */
export function normalizeForCheck(input: string): string {
  const decomposed = input.normalize("NFD").replace(/\p{M}/gu, "");
  const lower = decomposed.toLowerCase();
  const leetFolded = lower
    .split("")
    .map((c) => LEET_MAP[c] ?? c)
    .join("");
  return leetFolded.replace(/[^a-z]/g, "");
}

/**
 * Convert a display-name-style string into the literal token shape
 * we drop into a reply composer for an @-mention. Strips whitespace
 * and non-word characters so the lounge mention parser can round-trip
 * it: `@Mary S.` would split at the space, but `@MaryS` resolves
 * cleanly back to her email. Pure string op, safe to use from client
 * components.
 */
export function mentionTokenFor(displayName: string): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return "";
  const compact = trimmed.split(/\s+/).join("");
  return compact.replace(/[^\w]/g, "");
}

/* === Checks ================================================ */

export function isReservedName(displayName: string): boolean {
  const norm = normalizeForCheck(displayName);
  if (!norm) return false;
  for (const reserved of RESERVED_NAMES) {
    if (normalizeForCheck(reserved) === norm) return true;
  }
  return false;
}

export type ProfanityVerdict = "clean" | "blocked" | "borderline";

export function profanityVerdict(displayName: string): ProfanityVerdict {
  const norm = normalizeForCheck(displayName);
  if (!norm) return "clean";
  for (const token of slurTokens()) {
    if (norm.includes(token)) return "blocked";
  }
  for (const token of borderlineTokens()) {
    if (norm.includes(token)) return "borderline";
  }
  return "clean";
}

/* === Validation entry point ================================ */

export type DisplayNameValidation =
  | { ok: true; cleaned: string; flaggedForReview: boolean }
  | {
      ok: false;
      error: "empty" | "reserved" | "profanity";
    };

/**
 * Full validation pipeline. Caller is expected to have already run
 * sanitizeDisplayName (HTML brackets, control chars, URL guard).
 * Returns the cleaned input plus a borderline-review flag, or an error
 * code that maps to a user-facing message in the API layer.
 */
export function validateDisplayName(
  input: string
): DisplayNameValidation {
  const cleaned = input.trim();
  if (!cleaned) return { ok: false, error: "empty" };

  if (isReservedName(cleaned)) return { ok: false, error: "reserved" };

  const verdict = profanityVerdict(cleaned);
  if (verdict === "blocked") return { ok: false, error: "profanity" };

  return {
    ok: true,
    cleaned,
    flaggedForReview: verdict === "borderline",
  };
}

/* === Default-name disambiguation =========================== */

/**
 * Pick the least-disambiguated display name available for a new
 * signup, given the legal first/last name from Stripe and an
 * "is this name taken?" predicate.
 *
 * Order of preference:
 *   1. "First"
 *   2. "First L."           (last initial with trailing period)
 *   3. "First Last"         (full last name)
 *   4. "First Last 2", "First Last 3"… (numeric suffix as last resort)
 *
 * If `firstName` is empty we fall back to `fallback` (typically the
 * email local-part). Names that fail validation (reserved / slur)
 * are skipped — the next candidate is tried.
 */
export async function defaultDisplayName(args: {
  firstName: string;
  lastName: string;
  fallback: string;
  isTaken: (normalized: string) => Promise<boolean>;
}): Promise<string> {
  const base = (args.firstName || "").trim() || args.fallback.trim();
  const last = (args.lastName || "").trim();

  const candidates: string[] = [];
  if (base) candidates.push(base);
  if (base && last) {
    const initial = last[0]?.toUpperCase();
    if (initial) candidates.push(`${base} ${initial}.`);
    candidates.push(`${base} ${last}`);
  }

  for (const name of candidates) {
    const valid = validateDisplayName(name);
    if (!valid.ok) continue;
    const norm = normalizeForCheck(name);
    if (!norm) continue;
    if (!(await args.isTaken(norm))) return name;
  }

  // Last-resort numeric suffix on whatever the most-informative
  // candidate was (full name → first → fallback).
  const stem =
    candidates[candidates.length - 1] || base || args.fallback;
  for (let i = 2; i < 1000; i++) {
    const attempt = `${stem} ${i}`;
    const norm = normalizeForCheck(attempt);
    if (!norm) break;
    if (!(await args.isTaken(norm))) return attempt;
  }

  // We've exhausted ~1000 numeric variants — extremely unlikely. Hand
  // back the stem and let the caller decide; the unique-claim write
  // will fail loudly.
  return stem;
}

/**
 * Split a Stripe-provided full name into first + last. Stripe gives a
 * single string like "Adam Reynolds" or "Mary Anne Smith". We treat
 * the first whitespace-delimited token as the first name and the
 * remainder as the last name.
 */
export function splitFullName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  if (!fullName) return { firstName: "", lastName: "" };
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

/* === Cooldown ============================================== */

export const DISPLAY_NAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether a member can change their display name now. Admin renames
 * bypass this — only the member-self-edit path consults it.
 */
export function isWithinCooldown(
  lastChangedAt: number | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!lastChangedAt) return false;
  return nowMs - lastChangedAt < DISPLAY_NAME_COOLDOWN_MS;
}

export function cooldownExpiresAt(lastChangedAt: number): number {
  return lastChangedAt + DISPLAY_NAME_COOLDOWN_MS;
}
