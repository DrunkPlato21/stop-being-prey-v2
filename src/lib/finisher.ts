// Client-only state for the Finisher Achievement. Tracks how many pieces a
// reader has finished, which ones, and how many membership asks they've
// been shown, so recognition can recur while the ask stays capped.
//
// Backed by localStorage: cookieless (matches the site's first-party,
// no-cookie analytics ethos), no PII, per-browser. An account-level
// (cross-device) store can layer on later behind this same read surface
// without changing callers.

// Cadence knobs. The ask shows on the first finish, then at most every
// Nth, and stops entirely once this many asks have gone unconverted —
// respecting a "no" expressed through behavior rather than a click.
export const ASK_EVERY = 3;
export const ASK_BACKOFF_AFTER = 5;

const STORAGE_KEY = "sbp.finisher.v1";

export type FinisherState = {
  /** Distinct pieces finished (drives the ask cadence + streak copy). A
      re-finish of the same slug — e.g. a refresh — does NOT advance this. */
  count: number;
  /** Distinct finished slugs — also the dedupe key, so reloading a piece
      can't inflate the count or burn the cadence. Foundation for a future
      "collection"/streak surface ("read every piece this month"). */
  slugs: string[];
  /** Slugs where the membership ask was shown. Drives the back-off, and
      lets a re-finish of the same piece reproduce the same ask state so the
      block is stable on refresh. */
  asked: string[];
};

const EMPTY: FinisherState = { count: 0, slugs: [], asked: [] };

export function readFinisher(): FinisherState {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<FinisherState>;
    return {
      count: typeof p.count === "number" && p.count >= 0 ? p.count : 0,
      slugs: Array.isArray(p.slugs)
        ? p.slugs.filter((s): s is string => typeof s === "string")
        : [],
      asked: Array.isArray(p.asked)
        ? p.asked.filter((s): s is string => typeof s === "string")
        : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(state: FinisherState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota — the feature degrades to "every visit is new" */
  }
}

/** Whether to surface the membership ask on a finish at `count`, given how
    many asks have already been shown. Eligibility gating (non-member AND
    already on the email list) happens at the caller. First finish always
    asks; then every Nth; never after back-off. */
export function shouldShowAsk(count: number, asksShown: number): boolean {
  if (asksShown >= ASK_BACKOFF_AFTER) return false;
  if (count <= 1) return true;
  return (count - 1) % ASK_EVERY === 0;
}

/**
 * Register a finish for `slug` and resolve whether the membership ask
 * should show this time. Single read+write. Returns the post-increment
 * finish count and the ask decision so the component can render in one pass.
 *
 * `askEligible` is the caller's routing decision (non-member who is
 * already a list subscriber). When false the cadence is neither consulted
 * nor consumed, so a cold reader who subscribes later starts the
 * membership cadence fresh.
 */
export function registerFinish(
  slug: string,
  askEligible: boolean
): { count: number; showAsk: boolean; firstFinish: boolean } {
  const prev = readFinisher();

  // Re-finish of a piece already finished in this browser (typically a
  // refresh). Don't advance the count or burn the cadence; reproduce the
  // SAME ask state this piece had the first time, so the block doesn't
  // flicker on/off across reloads. Recognition still shows — the caller
  // renders it on every finish.
  if (prev.slugs.includes(slug)) {
    return {
      count: prev.count,
      showAsk: askEligible && prev.asked.includes(slug),
      firstFinish: false,
    };
  }

  // First time finishing this piece: advance the distinct-piece count and
  // run the ask cadence.
  const count = prev.count + 1;
  const slugs = [...prev.slugs, slug];
  let asked = prev.asked;
  const showAsk = askEligible && shouldShowAsk(count, asked.length);
  if (showAsk) asked = [...asked, slug];

  write({ count, slugs, asked });
  return { count, showAsk, firstFinish: true };
}
