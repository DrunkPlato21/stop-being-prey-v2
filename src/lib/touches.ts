// The path a visitor takes before paying. First-touch (sbp_channel) says
// where someone came from the first time; it can't say what convinced
// them. This keeps a short list of the surfaces that matter, newest
// last, in a first-party cookie:
//
//   archive            browsed the email archive index
//   sample:<slug>      read a free sample in full
//   teaser:<slug>      opened a locked email (saw its opening + the offer)
//   gift:<slug>        opened an email a patron gifted them
//   email:<campaign>   arrived on a tagged link from a broadcast (?e=...)
//
// The checkout route reads the cookie into Stripe metadata ("path"), and
// the webhook credits each touch on the became_member close and puts the
// whole path in Clay's new-patron alert. Plain module, no server imports,
// so the client half and the server half share one parser.

export const TOUCH_COOKIE = "sbp_path";
const MAX_TOUCHES = 12;
const YEAR_SECONDS = 60 * 60 * 24 * 365;
// Stripe metadata values cap at 500 characters.
export const MAX_PATH_CHARS = 480;

const TOUCH_RE = /^(archive|sample:[a-z0-9-]{1,60}|teaser:[a-z0-9-]{1,60}|gift:[a-z0-9-]{1,60}|email:[a-z0-9-]{1,40})$/;

/** Lowercase, hyphenated, length-capped: safe inside a touch token. */
export function touchSlug(s: string, max = 60): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

export function parseTouches(raw: string | undefined | null): string[] {
  if (!raw) return [];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return decoded
    .split("|")
    .filter((t) => TOUCH_RE.test(t))
    .slice(-MAX_TOUCHES);
}

/**
 * Append a touch the first time it happens. A reload, a back-button
 * return, or a second visit to the same email doesn't add it again, so
 * the path reads as the order things were first seen.
 */
export function addTouch(list: string[], touch: string): string[] {
  if (!TOUCH_RE.test(touch)) return list;
  if (list.includes(touch)) return list;
  return [...list, touch].slice(-MAX_TOUCHES);
}

/** The path as stored in Stripe metadata, trimmed from the oldest end. */
export function serializeTouches(list: string[]): string {
  let out = list.join("|");
  while (out.length > MAX_PATH_CHARS && list.length > 1) {
    list = list.slice(1);
    out = list.join("|");
  }
  return out.slice(0, MAX_PATH_CHARS);
}

/** Human-readable, for the new-patron alert. */
export function describeTouches(list: string[]): string {
  if (list.length === 0) return "(nothing tracked)";
  const label = (t: string) => {
    const [kind, rest] = t.split(":");
    switch (kind) {
      case "archive":
        return "browsed the archive";
      case "sample":
        return `read free sample "${rest}"`;
      case "teaser":
        return `opened locked email "${rest}"`;
      case "gift":
        return `opened gifted email "${rest}"`;
      case "email":
        return `clicked from email "${rest}"`;
      default:
        return t;
    }
  };
  return list.map(label).join(" → ");
}

/**
 * What each touch counts toward on a conversion: the kind on its own
 * ("archive", "sample", ...) plus the specific sample or email campaign,
 * once each, however many times it appears in the path.
 */
export function conversionKeys(list: string[]): string[] {
  const keys = new Set<string>();
  for (const t of list) {
    const kind = t.split(":")[0];
    keys.add(kind);
    if (kind === "sample" || kind === "email") keys.add(t);
  }
  return [...keys];
}

/** Client only: record one touch in the cookie. Never throws. */
export function recordTouch(touch: string): void {
  if (typeof document === "undefined") return;
  try {
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${TOUCH_COOKIE}=`))
      ?.slice(TOUCH_COOKIE.length + 1);
    const next = addTouch(parseTouches(current), touch);
    document.cookie = `${TOUCH_COOKIE}=${encodeURIComponent(
      next.join("|")
    )}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
  } catch {
    /* best-effort */
  }
}
