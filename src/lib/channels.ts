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
