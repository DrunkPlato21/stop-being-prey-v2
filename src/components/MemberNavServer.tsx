import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getNavDots } from "@/lib/nav-dots";
import { MemberNav, type MemberNavDots } from "@/components/MemberNav";

// Server wrapper around MemberNav. Reads the current session, asks the
// nav-dots layer which sections have new content since this member's
// last visit, and renders the client nav with the resulting map.
//
// Anonymous viewers (no session) and missing-creds environments return
// an all-false dot state from getNavDots, so the nav still renders
// cleanly with no indicators. Each member-area layout that previously
// imported MemberNav now imports this server component instead — the
// client-side MemberNav remains unchanged in terms of the URL it lives
// on, just receives the freshly-computed `dots` prop.

export async function MemberNavServer() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const state = await getNavDots(session?.email ?? null);

  const dots: MemberNavDots = {
    "/lounge": state.lounge,
    "/case-files": state.caseFiles,
    "/notes/field-notes": state.fieldNotes,
  };

  return <MemberNav dots={dots} />;
}
