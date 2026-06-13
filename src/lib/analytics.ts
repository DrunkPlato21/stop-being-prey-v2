import { Redis } from "@upstash/redis";

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
  "pool_fund_started",
  "pool_funded",
  "pool_requested",
  "pool_confirmed",
  "pool_claimed",
  "pool_waitlisted",
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
  opts: { slug?: string; source?: TrackSource } = {}
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
  if (tasks.length === 0) return;

  try {
    await Promise.all(tasks);
  } catch {
    /* swallow: a failed counter must not surface to the caller */
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
