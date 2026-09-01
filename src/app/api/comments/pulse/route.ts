import { latestCommentActivityAt } from "@/lib/comments";

// GET /api/comments/pulse
//
// The cheap half of comment liveness. CommentsLiveRefresh used to call
// router.refresh() on a timer, and an article route is dynamic, so that
// re-rendered the entire page on the server twice a minute for every
// open tab whether or not anything had happened. This answers the only
// question that timer actually has, "is there anything new", with one
// ZRANGE. The page re-renders when the answer changes and not otherwise.
//
// The answer is identical for every viewer, so the CDN hands out copies
// (s-maxage) the same way /api/presence does. A room full of readers
// costs a few invocations a minute site-wide instead of two per reader.
//
// Site-wide rather than per-slug, on purpose. A thread reply lives
// inside its parent's record and its only index entry is the global
// activity ZSET, so a per-slug pulse would go blind on exactly the
// replies this liveness was built to surface. The price is an
// occasional refresh on a page whose own comments did not change, which
// at this volume is rare and costs one render.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const at = await latestCommentActivityAt().catch(() => 0);

  return Response.json(
    { ok: true, at },
    {
      headers: {
        "cache-control": "public, s-maxage=20, stale-while-revalidate=60",
      },
    }
  );
}
