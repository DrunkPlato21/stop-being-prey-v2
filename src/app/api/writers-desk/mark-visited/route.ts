import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { setLastVisited } from "@/lib/desk-visits";
import { isAdmin } from "@/lib/comments";

// Called by the Writer's Desk widget a few seconds after mount, after
// the member has had time to scan the NEW badges. Bumps the per-member
// last-visited stamp so the same items don't re-show as NEW next visit.
//
// Admins are skipped — Clay's already-seen-everything view shouldn't
// pollute his own freshness baseline.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (!session?.email) {
    return Response.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (isAdmin(session.email)) {
    return Response.json({ ok: true, skipped: true });
  }
  await setLastVisited(session.email, Date.now());
  return Response.json({ ok: true });
}
