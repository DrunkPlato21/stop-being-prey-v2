// Traffic-source channels — a SECOND analytics dimension alongside
// `source` (analytics.ts). `source` is the on-site surface that sent a
// buyer (inline form, sticky bar, finisher); `channel` is where the
// visitor came from OFF-site (facebook, twitter, google, direct...),
// captured first-touch. Kept in its own module with NO server imports so
// the client first-touch tracker can bucket a referrer without dragging
// the Redis client into the browser bundle.

export const TRACK_CHANNELS = [
  "facebook",
  "instagram",
  "twitter",
  "reddit",
  "youtube",
  "google",
  "email",
  // A reader passed the piece on by hand: forwarded the email, or copied
  // the link and pasted it somewhere. Both arrive with NO referrer, so
  // until now they were indistinguishable from "direct". The share row
  // tags those two links with ?ref=share to separate them out. Twitter
  // and Facebook links are deliberately left untagged — their referrer
  // already identifies them, and tagging would move that traffic out of
  // its own bucket.
  "share",
  "direct",
  "other",
] as const;
export type TrackChannel = (typeof TRACK_CHANNELS)[number];

export function asTrackChannel(v: unknown): TrackChannel | undefined {
  return typeof v === "string" &&
    (TRACK_CHANNELS as readonly string[]).includes(v)
    ? (v as TrackChannel)
    : undefined;
}

// Hostname fragment -> channel. First match wins.
const HOST_RULES: Array<[RegExp, TrackChannel]> = [
  [/(^|\.)(facebook|fb)\.|(^|\.)fb\.me|(^|\.)l\.facebook|(^|\.)lm\.facebook/, "facebook"],
  [/(^|\.)instagram\.com|(^|\.)l\.instagram/, "instagram"],
  [/(^|\.)(twitter|x)\.com|(^|\.)t\.co/, "twitter"],
  [/(^|\.)reddit\.com|(^|\.)redd\.it/, "reddit"],
  [/(^|\.)youtube\.com|(^|\.)youtu\.be/, "youtube"],
  [/(^|\.)google\./, "google"],
];

// An explicit utm_source / ref param (e.g. a tagged link) overrides the
// referrer guess. Normalized loosely to the channel vocabulary.
function fromTag(tag: string): TrackChannel | undefined {
  const t = tag.toLowerCase();
  // Must come first. "share" would otherwise be caught by nothing, but a
  // future "share-email" style tag would fall into the email rule below
  // and get counted as a newsletter send, which is the one thing this
  // channel exists to tell apart.
  if (/^share/.test(t)) return "share";
  if (/facebook|fb|meta/.test(t)) return "facebook";
  if (/instagram|ig/.test(t)) return "instagram";
  if (/twitter|x\.com|tweet/.test(t)) return "twitter";
  if (/reddit/.test(t)) return "reddit";
  if (/youtube|yt/.test(t)) return "youtube";
  if (/google|adwords|gads/.test(t)) return "google";
  if (/email|newsletter|kit|mailing/.test(t)) return "email";
  return asTrackChannel(t);
}

/**
 * Bucket a visit into a channel. `search` is the entry URL's query string
 * (location.search); `referrer` is document.referrer. A tagged
 * utm_source/ref param wins; otherwise the referrer host decides; an
 * empty referrer is "direct"; anything unrecognized is "other".
 */
export function channelFromReferrer(
  referrer: string,
  search: string
): TrackChannel {
  try {
    const params = new URLSearchParams(search || "");
    const tag = params.get("utm_source") || params.get("ref");
    if (tag) {
      const tagged = fromTag(tag);
      if (tagged) return tagged;
    }
  } catch {
    /* ignore malformed query */
  }

  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (!host) return "direct";

  for (const [re, channel] of HOST_RULES) {
    if (re.test(host)) return channel;
  }
  return "other";
}

// ---------------------------------------------------------------------
// Raw referrers.
//
// The buckets above are deliberately coarse, and that coarseness costs
// the one thing the channel table can never tell you: WHICH site. Every
// referrer outside the six known hosts lands in "other" and its identity
// is discarded on the spot. A forum, a newsletter, an aggregator, someone
// else's blog — all one undifferentiated number. These helpers keep the
// referring host and path so /admin/analytics can name them.
//
// Stored shape is "host/path" with no scheme: shorter keys, and the host
// falls out of a single split. Query and hash are dropped on purpose —
// they carry search terms and session ids we don't want to hold, and
// unbounded key cardinality we want even less.

/** Lowercase, strip a leading www. so one site is one row. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** The host half of a stored referrer ("a.com/b/c" -> "a.com"). */
export function referrerHostOf(referrer: string): string {
  return referrer.split("/")[0] ?? "";
}

const MAX_REFERRER_LEN = 200;

/**
 * Reduce document.referrer to a storable "host/path", or undefined when
 * there is nothing worth storing: no referrer, a non-http(s) scheme, or a
 * same-host referrer (internal movement, not an arrival).
 */
export function referrerFrom(
  referrer: string,
  currentHost: string
): string | undefined {
  if (!referrer) return undefined;
  let u: URL;
  try {
    u = new URL(referrer);
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  const host = normalizeHost(u.hostname);
  if (!host) return undefined;
  if (currentHost && host === normalizeHost(currentHost)) return undefined;
  // Trailing slash stripped so "a.com/" and "a.com" are one row.
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}`.slice(0, MAX_REFERRER_LEN);
}

/**
 * Server-side gate for a referrer arriving in a request body. /api/track
 * is public, so this value is attacker-controlled: re-canonicalize it
 * through the same parser rather than trusting the string, and require a
 * dotted hostname so junk can't mint rows.
 */
export function asReferrer(v: unknown): string | undefined {
  if (typeof v !== "string" || !v || v.length > MAX_REFERRER_LEN) {
    return undefined;
  }
  if (/[\s<>"'\\]/.test(v)) return undefined;
  const canon = referrerFrom(`https://${v}`, "");
  if (!canon) return undefined;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(referrerHostOf(canon))) {
    return undefined;
  }
  return canon;
}
