import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { getMember } from "@/lib/members";
import { StickyNav } from "@/components/StickyNav";

// Server-side wrapper for the sticky scroll bar. Resolves session +
// paid-member status, then hands the resolved booleans to the client
// component. Rendered by the root layout (not Header), so its child's
// position:fixed isn't trapped inside Header's stacking context — that
// was the bug where article content rendered on top of the bar.

export async function StickyNavServer() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return <StickyNav signedIn={false} isPaidMember={false} />;
  }

  // Admin counts as paid for chrome purposes (matches Header logic).
  if (isAdmin(session.email)) {
    return <StickyNav signedIn={true} isPaidMember={true} />;
  }

  const member = await getMember(session.email).catch(() => null);
  const isPaidMember =
    !!member && (member.status === "active" || member.status === "trialing");

  return <StickyNav signedIn={true} isPaidMember={isPaidMember} />;
}
