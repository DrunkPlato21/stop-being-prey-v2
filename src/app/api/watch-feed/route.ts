import { isWatchFeedConfigured, listWatchPosts } from "@/lib/watch-feed";

// Public-ish read endpoint for The Watch Feed. Polled by the member
// view in /lounge every few seconds. Returns recent posts newest-first.
//
// Not auth-gated at the route level: the lounge page itself is
// session-gated upstream, so anonymous direct hits to this endpoint
// just get the same content the lounge would show — there's no
// member-specific data in the response.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ ok: true, posts: [] });
  }
  const posts = await listWatchPosts(50);
  return Response.json({ ok: true, posts });
}
