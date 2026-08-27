import { Redis } from "@upstash/redis";
import {
  TRACK_CHANNELS,
  asTrackChannel,
  referrerHostOf,
  type TrackChannel,
} from "./channels";

export { TRACK_CHANNELS, asTrackChannel, type TrackChannel };

// First-party, cookieless funnel analytics. Counts a small set of events
// per article (and per subscribe source) as plain Redis hash counters.
// One HINCRBY per event keeps the command cost trivial (see /api/track).
//
// Namespacing — important because dev shares the LIVE Upstash instance:
//   - Production writes      -> "analytics:"      (real visitor data)
//   - Dev / localhost writes -> "analytics:dev:"  (kept out of prod)
// The admin dashboard runs only on localhost (proxy.ts 404s /admin in
// prod), so it reads the PROD namespace explicitly via getArticleCounts
// to show real visitor data — not the dev events from local browsing.

export const TRACK_EVENTS = [
  "view",
  "scroll_25",
  "scroll_50",
  "scroll_75",
  "scroll_100",
  "form_seen",
  "sub_submit",
  "sub_success",
  // Outbound click on the "Pass it on" row under a piece. The `channel`
  // dimension carries WHICH button (twitter / facebook / email / share
  // for copy-link). This is the only surface on the site that was never
  // instrumented, so there is currently no way to know whether readers
  // share at all. Pairs with the "share" channel on the inbound side:
  // this counts intent, that counts arrivals.
  "share_click",
  // End-of-read capture + membership funnel. achievement_shown fires on a
  // non-member's first finish of a piece (the denominator for both ask
  // flavors; the legacy event name is kept so the counter series stays
  // continuous); ask_shown only when a known subscriber is shown
  // the membership ask (after the cadence cap); checkout_started when
  // they click through toward membership; became_member on the Stripe
  // webhook (server-side, source-attributed). Cold readers get the email
  // form instead, tracked via sub_submit/sub_success source "finisher".
  "achievement_shown",
  "ask_shown",
  "checkout_started",
  "became_member",
  // Pay-it-forward gift funnel. gift_purchased on the Stripe webhook
  // (lane "gift"), gift_redeemed when the recipient claims the seat,
  // gift_converted when a gifted recipient later becomes a paying
  // member on their own card (stamped in the membership webhook).
  "gift_purchased",
  "gift_redeemed",
  "gift_converted",
  // Community seat pool funnel (anonymous pay-it-forward). All recorded
  // server-side with source "pool": pool_fund_started on the give-side
  // checkout create, pool_funded on the Stripe webhook (lane "pool"),
  // pool_requested when a claimer submits the form, pool_confirmed when
  // they click the email confirm link, pool_claimed when a seat is
  // granted (immediately or to a waitlisted claimer when a seat funds),
  // pool_waitlisted when no seat was free and they joined the line.
  // Chip-in (pot) sub-funnel: pool_contribution_started on the checkout
  // create, pool_contributed on the webhook when an open-amount payment
  // lands in the pot.
  "pool_fund_started",
  "pool_funded",
  "pool_requested",
  "pool_confirmed",
  "pool_claimed",
  "pool_waitlisted",
  "pool_contribution_started",
  "pool_contributed",
  // Draft gate. gate_shown fires server-side when a non-member lands on
  // an unpublished piece at its real URL and gets the join prompt instead
  // of the body. Carries the slug, so it lands in the per-article counters
  // beside that piece's views. This is the highest-intent surface on the
  // site during a members-first window and it was previously invisible:
  // the window closes when the piece publishes and the measurement can
  // never be repeated for that piece.
  "gate_shown",
  // Sign-in funnel. signin_requested on every well-formed link request
  // that clears the rate limiter; signin_no_match on the subset where the
  // address resolves to no membership. The gap between them is the number
  // of people who tried to get in and couldn't. Before this, that failure
  // was invisible on both sides: the caller gets a deliberate silent 200
  // (so the endpoint can't be used to probe who is a member) and nothing
  // was written anywhere. The only way it ever surfaced was a reader
  // emailing to ask why no link arrived.
  "signin_requested",
  "signin_no_match",
] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

export const TRACK_SOURCES = [
  "inline",
  "sticky",
  "dual",
  "join",
  "footer",
  "finisher",
  "tip",
  "gift",
  "pool",
  "rules",
  "about",
  "comments",
  // Surfaces that link to the membership page and were never tagged, so
  // every buyer arriving through them landed in "unknown". That was all
  // of them: 35 of 35 paid conversions and 56 of 59 checkout starts were
  // unattributed, because `source` is read from a ?src= param that only
  // five of the site's ~28 membership links carried.
  //   header      site-wide nav CTA (Header + HeaderJoinLink + StickyNav)
  //   hero        homepage hero
  //   essay       inline "become a patron" inside a piece
  //   gate        the draft gate a non-member hits on an unpublished piece
  //   case_file   case-file body + the preview-mode funnel link
  //   coin        the /coin explainer
  //   cover       "back to membership" off the cover-a-seat page
  //   reactivate  "back to patronage" off the lapsed-member page
  "header",
  "hero",
  "essay",
  "gate",
  "case_file",
  "coin",
  "cover",
  "reactivate",
  // The Arena's public case. A sealed bout Clay unlocks and mails out is
  // the room's one cold-traffic surface, and it was shipped tagged
  // ?src=arena against a list that had never heard of it — so every
  // conversion off the strongest thing the site can show a stranger fell
  // through asTrackSource into "unknown", the same way the eight above
  // did. Covers both funnels on that page: the closing "Take a seat"
  // block and the preview nav wrapped around it.
  "arena",
  // The sign-in page. Its events carry no article slug, and recordEvent
  // writes nothing at all for a slugless event that isn't source-tracked,
  // so this source is what gives them somewhere to land.
  "signin",
  "unknown",
] as const;
export type TrackSource = (typeof TRACK_SOURCES)[number];

// Events that also roll up into a per-source counter (analytics:source:*)
// so a conversion surface can be measured on its own, not just per article.
const SOURCE_TRACKED_EVENTS: ReadonlySet<string> = new Set([
  "sub_submit",
  "sub_success",
  "checkout_started",
  "became_member",
  "gift_purchased",
  "gift_redeemed",
  "gift_converted",
  "pool_fund_started",
  "pool_funded",
  "pool_requested",
  "pool_confirmed",
  "pool_claimed",
  "pool_waitlisted",
  "pool_contribution_started",
  "pool_contributed",
  // Slugless by nature: the sign-in page isn't tied to one piece. Without
  // being listed here they would write nothing at all.
  "signin_requested",
  "signin_no_match",
]);

// Events that also roll up into a per-CHANNEL counter (analytics:channel:*)
// so the acquisition funnel can be read by where the visitor came from
// (facebook / google / direct ...). Just the funnel skeleton: a visit, a
// checkout start, a paid conversion.
const CHANNEL_TRACKED_EVENTS: ReadonlySet<string> = new Set([
  "view",
  "checkout_started",
  "became_member",
]);

/**
 * Narrow an arbitrary value to a known TrackSource (or undefined). Used
 * server-side where a source arrives from a request body or Stripe
 * metadata and must be validated before it's counted.
 */
export function asTrackSource(v: unknown): TrackSource | undefined {
  return typeof v === "string" &&
    (TRACK_SOURCES as readonly string[]).includes(v)
    ? (v as TrackSource)
    : undefined;
}

export type EventCounts = Partial<Record<TrackEvent, number>>;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function prefix(dev: boolean): string {
  return dev ? "analytics:dev:" : "analytics:";
}

function isDevWrite(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Record one event. At most two HINCRBYs (article counter, plus a source
 * counter for subscribe events). Never throws — analytics must never be
 * able to break a request.
 */
export async function recordEvent(
  event: TrackEvent,
  opts: { slug?: string; source?: TrackSource; channel?: TrackChannel } = {}
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const ns = prefix(isDevWrite());

  const tasks: Promise<unknown>[] = [];
  if (opts.slug) {
    tasks.push(client.hincrby(`${ns}article:${opts.slug}`, event, 1));
  }
  if (SOURCE_TRACKED_EVENTS.has(event)) {
    const source = opts.source ?? "unknown";
    tasks.push(client.hincrby(`${ns}source:${source}`, event, 1));
  }
  // Channel counter only when the visit was attributed to one (the
  // first-touch cookie). No cookie -> no channel write, rather than
  // dumping everything into an "unknown" bucket.
  if (opts.channel && CHANNEL_TRACKED_EVENTS.has(event)) {
    tasks.push(client.hincrby(`${ns}channel:${opts.channel}`, event, 1));
  }
  if (tasks.length === 0) return;

  try {
    await Promise.all(tasks);
  } catch {
    /* swallow: a failed counter must not surface to the caller */
  }
}

// ---------------------------------------------------------------------
// Raw referrer leaderboards. The channel counters answer "how much of my
// traffic is social vs search"; these answer "who is linking me that I
// don't know about" — the question the "other" bucket swallows.
//
// Sorted sets rather than hashes, for two reasons: the top N is one
// command instead of dragging the whole key back, and each write can
// self-trim. /api/track is public, so a forged payload could otherwise
// grow these keys without bound. ZREMRANGEBYRANK evicts the lowest-scoring
// entries once over the cap and is a no-op below it, so it rides along in
// the same pipeline at no extra round trip.
// Caps are an abuse backstop, not a budget: sized so they never bind in
// normal operation. They matter because eviction takes the LOWEST score,
// so a full set would silently stop admitting new one-off referrers —
// exactly the discovery this exists for. getReferrers reports the live
// size against the cap so that can never happen unnoticed.
const REFERRER_HOST_KEY = "referrer:host";
const REFERRER_URL_KEY = "referrer:url";
export const MAX_REFERRER_HOSTS = 2000;
export const MAX_REFERRER_URLS = 5000;

export type ReferrerRow = { name: string; count: number };
export type ReferrerReport = {
  hosts: ReferrerRow[];
  urls: ReferrerRow[];
  /** Distinct sites / pages held, against the caps above. */
  hostTotal: number;
  urlTotal: number;
};

/**
 * Count one off-site arrival, by host and by exact page. `referrer` is a
 * canonical "host/path" string (see asReferrer, which is what validates
 * it on the way in). One pipelined round trip; never throws.
 */
export async function recordReferrer(referrer: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const host = referrerHostOf(referrer);
  if (!host) return;
  const ns = prefix(isDevWrite());
  const hostKey = `${ns}${REFERRER_HOST_KEY}`;
  const urlKey = `${ns}${REFERRER_URL_KEY}`;

  try {
    const pipe = client.pipeline();
    pipe.zincrby(hostKey, 1, host);
    pipe.zincrby(urlKey, 1, referrer);
    pipe.zremrangebyrank(hostKey, 0, -(MAX_REFERRER_HOSTS + 1));
    pipe.zremrangebyrank(urlKey, 0, -(MAX_REFERRER_URLS + 1));
    await pipe.exec();
  } catch {
    /* swallow: a failed counter must not surface to the caller */
  }
}

function coerceRows(raw: unknown): ReferrerRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ReferrerRow[] = [];
  // withScores comes back flat: [member, score, member, score, ...]
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = String(raw[i]);
    if (name) rows.push({ name, count: Number(raw[i + 1]) || 0 });
  }
  return rows;
}

/**
 * Top referring hosts and top exact referring pages, highest first.
 * Same dev/prod namespace selection as the counters.
 */
export async function getReferrers(
  dev = false,
  limit = 50
): Promise<ReferrerReport> {
  const empty: ReferrerReport = {
    hosts: [],
    urls: [],
    hostTotal: 0,
    urlTotal: 0,
  };
  const client = getClient();
  if (!client) return empty;
  const ns = prefix(dev);
  const hostKey = `${ns}${REFERRER_HOST_KEY}`;
  const urlKey = `${ns}${REFERRER_URL_KEY}`;
  try {
    const [hosts, urls, hostTotal, urlTotal] = await Promise.all([
      client.zrange(hostKey, 0, limit - 1, { rev: true, withScores: true }),
      client.zrange(urlKey, 0, limit - 1, { rev: true, withScores: true }),
      client.zcard(hostKey),
      client.zcard(urlKey),
    ]);
    return {
      hosts: coerceRows(hosts),
      urls: coerceRows(urls),
      hostTotal: Number(hostTotal) || 0,
      urlTotal: Number(urlTotal) || 0,
    };
  } catch {
    return empty;
  }
}

function coerceCounts(raw: Record<string, unknown> | null): EventCounts {
  const counts: EventCounts = {};
  if (!raw) return counts;
  for (const key of Object.keys(raw)) {
    if ((TRACK_EVENTS as readonly string[]).includes(key)) {
      counts[key as TrackEvent] = Number(raw[key]) || 0;
    }
  }
  return counts;
}

/**
 * Read per-article counters for the given slugs. `dev` selects the
 * namespace: the admin passes false (prod) to see real visitor data, or
 * true to inspect local dev events. One pipelined HGETALL per slug.
 */
export async function getArticleCounts(
  slugs: string[],
  dev = false
): Promise<Map<string, EventCounts>> {
  const out = new Map<string, EventCounts>();
  const client = getClient();
  if (!client || slugs.length === 0) {
    slugs.forEach((s) => out.set(s, {}));
    return out;
  }
  const ns = prefix(dev);
  const pipe = client.pipeline();
  slugs.forEach((s) => pipe.hgetall(`${ns}article:${s}`));
  const results = (await pipe.exec()) as (Record<string, unknown> | null)[];
  slugs.forEach((s, i) => out.set(s, coerceCounts(results[i] ?? null)));
  return out;
}

/**
 * Read the subscribe-by-source counters (sub_submit / sub_success).
 */
export async function getSourceCounts(
  dev = false
): Promise<Map<TrackSource, EventCounts>> {
  const out = new Map<TrackSource, EventCounts>();
  const client = getClient();
  if (!client) {
    TRACK_SOURCES.forEach((s) => out.set(s, {}));
    return out;
  }
  const ns = prefix(dev);
  const pipe = client.pipeline();
  TRACK_SOURCES.forEach((s) => pipe.hgetall(`${ns}source:${s}`));
  const results = (await pipe.exec()) as (Record<string, unknown> | null)[];
  TRACK_SOURCES.forEach((s, i) => out.set(s, coerceCounts(results[i] ?? null)));
  return out;
}

/**
 * Read the per-channel funnel counters (view / checkout_started /
 * became_member), so acquisition can be measured by where visitors came
 * from. Same dev/prod namespace selection as the others.
 */
export async function getChannelCounts(
  dev = false
): Promise<Map<TrackChannel, EventCounts>> {
  const out = new Map<TrackChannel, EventCounts>();
  const client = getClient();
  if (!client) {
    TRACK_CHANNELS.forEach((c) => out.set(c, {}));
    return out;
  }
  const ns = prefix(dev);
  const pipe = client.pipeline();
  TRACK_CHANNELS.forEach((c) => pipe.hgetall(`${ns}channel:${c}`));
  const results = (await pipe.exec()) as (Record<string, unknown> | null)[];
  TRACK_CHANNELS.forEach((c, i) => out.set(c, coerceCounts(results[i] ?? null)));
  return out;
}
