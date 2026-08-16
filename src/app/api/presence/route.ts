import { derivePresenceState, getPresence } from "@/lib/desk";

// GET /api/presence
//
// The anonymous half of /api/chrome: desk presence only, no cookies, no
// identity. Every signed-out browser used to call /api/chrome per page
// view just to learn presence plus { signedIn: false } — the same answer
// for everyone. This endpoint says that shared answer once a minute and
// lets the CDN hand out copies (s-maxage), so a traffic spike of readers
// costs edge cache hits instead of function invocations and Redis reads.
// Signed-in browsers never call this; the sbp_who cookie routes them to
// /api/chrome (see components/chrome.ts).
//
// stale-while-revalidate keeps the header instant when the cache entry
// lapses: the stale copy serves while one request refreshes it. Worst
// case the presence dot is a few minutes behind, which it already was —
// viewers only refetch chrome on a full page load anyway.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const presence = await getPresence()
    .then((p) => derivePresenceState(p))
    .catch(() => "auto-expired" as const);

  return Response.json(
    { ok: true, presence },
    {
      headers: {
        "cache-control": "public, s-maxage=60, stale-while-revalidate=600",
      },
    }
  );
}
