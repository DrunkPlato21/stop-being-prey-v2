import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { getMember, hasLiveSeat } from "@/lib/members";

// True when the current viewer is a paying member (or the admin/author).
// Used to suppress email-capture surfaces for people who are already on
// the list and in the room — a paid member doesn't need to be asked to
// "join 9,304 readers."
//
// Mirrors the signed-in/paid resolution in StickyNavServer. Memoized per
// request via React's cache() so multiple call sites in one render share a
// single session verify + member lookup. Reads cookies(), but the root
// layout already does (StickyNavServer), so this adds no rendering-mode
// cost — article pages are dynamic regardless.
export const isPaidViewer = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session?.email) return false;
  if (isAdmin(session.email)) return true;
  const member = await getMember(session.email).catch(() => null);
  return hasLiveSeat(member);
});
