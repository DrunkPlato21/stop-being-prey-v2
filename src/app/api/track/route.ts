import type { NextRequest } from "next/server";
import {
  recordEvent,
  TRACK_EVENTS,
  TRACK_SOURCES,
  asTrackChannel,
  type TrackEvent,
  type TrackSource,
} from "@/lib/analytics";

// First-party event sink for the funnel analytics. Public (not behind the
// admin gate) because real visitors POST to it. Always answers 204 and
// never errors the client — a bad/forged payload is simply ignored.
//
// Cheap by design: client dedupes (one view per session, each scroll
// milestone once), basic bot filtering here, and recordEvent does at most
// two Redis writes. See src/lib/analytics.ts for the cost model.

// Conservative bot/preview filter. Misses some bots, but keeps obvious
// crawlers and link-unfurlers out of the reader funnel.
const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|preview|curl|wget|python-requests|headless|lighthouse|pingdom|uptime|monitor/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_RE.test(ua)) {
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const rawEvent = (body as { event?: unknown })?.event;
  if (
    typeof rawEvent !== "string" ||
    !(TRACK_EVENTS as readonly string[]).includes(rawEvent)
  ) {
    return new Response(null, { status: 204 });
  }
  const event = rawEvent as TrackEvent;

  const rawSlug = (body as { slug?: unknown })?.slug;
  const slug =
    typeof rawSlug === "string" && SLUG_RE.test(rawSlug) ? rawSlug : undefined;

  const rawSource = (body as { source?: unknown })?.source;
  const source =
    typeof rawSource === "string" &&
    (TRACK_SOURCES as readonly string[]).includes(rawSource)
      ? (rawSource as TrackSource)
      : undefined;

  const channel = asTrackChannel((body as { channel?: unknown })?.channel);

  await recordEvent(event, { slug, source, channel });
  return new Response(null, { status: 204 });
}
