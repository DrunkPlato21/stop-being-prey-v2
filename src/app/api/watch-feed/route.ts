import {
  isWatchFeedConfigured,
  isWatchFeedEnabled,
  listWatchPosts,
} from "@/lib/watch-feed";
import { listRecentArrivals } from "@/lib/lounge";

// Public-ish read endpoint for The Watch Feed. Polled by the member
// view in /lounge every few seconds. Returns the on/off state, recent
// posts (newest-first), and recent arrivals for the live Wire ticker.
//
// Not auth-gated at the route level: the lounge page itself is
// session-gated upstream, so anonymous direct hits to this endpoint
// just get the same content the lounge would show — there's no
// member-specific data in the response.
//
// When the feed is switched off, we short-circuit to an empty,
// disabled payload so the member view renders nothing without paying
// for the posts/arrivals reads.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ ok: true, enabled: false, posts: [], arrivals: [] });
  }
  const enabled = await isWatchFeedEnabled();
  if (!enabled) {
    return Response.json({ ok: true, enabled: false, posts: [], arrivals: [] });
  }
  const [posts, arrivals] = await Promise.all([
    listWatchPosts(50),
    listRecentArrivals({}),
  ]);
  return Response.json({ ok: true, enabled: true, posts, arrivals });
}
