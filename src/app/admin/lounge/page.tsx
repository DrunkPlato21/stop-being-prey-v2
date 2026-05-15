import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import {
  bumpActiveNow,
  countLoungeAuthors,
  getActiveNow,
  getLastViewed,
  getPinnedPost,
  getReadByClayPostIds,
  getReadByClayReplyIds,
  listVisiblePosts,
  listVisibleReplies,
  MEMBER_AREA_LAUNCH_ISO,
  reactionSnapshots,
  setLastViewed,
  type LoungePost,
  type LoungeReply,
  type ReactionTarget,
} from "@/lib/lounge";
import {
  getFounderSlot,
  getMember,
  getTierBadge,
  type TierBadge,
} from "@/lib/members";
import { LoungeView } from "@/components/LoungeView";

// Admin-side view of the lounge. Identical content + interactions to
// /lounge, but lives under /admin/* for two reasons:
//
//   1. PWA scope. The admin manifest has scope: "/admin/". A link
//      from /admin/desk to /lounge would kick the installed admin
//      window into the browser. /admin/lounge stays in the PWA.
//
//   2. Basic-auth pre-flight. proxy.ts gates /admin/* with the
//      ADMIN_PASSWORD challenge, so visiting /admin/lounge forces the
//      auth handshake before the lounge renders. Subsequent fetches
//      to /api/admin/lounge/* (mark-read, pin, delete, annotate) pick
//      up the cached credentials automatically. No more "buttons
//      silently fail because I didn't auth first".
//
// The page reuses LoungeView (same client component as /lounge) with
// isAdmin forced true. Member session is still required for reactions
// and presence tracking — admin without a session redirects to
// sign-in.
//
// Dark mode falls out for free: this page sits inside src/app/admin/,
// so AdminLayout's no-flash theme script + AdminDeskDarkToggle apply.

export const metadata: Metadata = {
  title: "The Lounge",
};

export const dynamic = "force-dynamic";

const INITIAL_PAGE = 20;

export default async function AdminLoungePage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/admin/lounge");
  }

  await bumpActiveNow(session.email).catch(() => null);

  const [pinned, page, lastVisitedAt, activeNow, authorCount] =
    await Promise.all([
      getPinnedPost(),
      listVisiblePosts({ limit: INITIAL_PAGE }),
      getLastViewed(session.email),
      getActiveNow(session.email, isAdmin),
      countLoungeAuthors(),
    ]);

  const posts = pinned
    ? page.posts.filter((p) => p.id !== pinned.id)
    : page.posts;
  const allPosts = pinned ? [pinned, ...posts] : posts;

  const replyLists = await Promise.all(
    allPosts.map((p) => listVisibleReplies(p.id, 50))
  );
  const replies: Record<string, LoungeReply[]> = {};
  allPosts.forEach((p: LoungePost, i: number) => {
    replies[p.id] = replyLists[i];
  });

  const targets: ReactionTarget[] = [];
  const allPostIds: string[] = [];
  const allReplyIds: string[] = [];
  for (const p of allPosts) {
    targets.push({ kind: "post", id: p.id });
    allPostIds.push(p.id);
    for (const r of replies[p.id]) {
      targets.push({ kind: "reply", id: r.id });
      allReplyIds.push(r.id);
    }
  }
  const [reactions, readByClayPostIdsSet, readByClayReplyIdsSet] =
    await Promise.all([
      reactionSnapshots(session.email, targets),
      getReadByClayPostIds(allPostIds),
      getReadByClayReplyIds(allReplyIds),
    ]);
  const readByClayPostIds = Array.from(readByClayPostIdsSet);
  const readByClayReplyIds = Array.from(readByClayReplyIdsSet);

  const uniqueEmails = Array.from(
    new Set([
      session.email.toLowerCase().trim(),
      ...allPosts.map((p) => p.memberEmail),
      ...Object.values(replies).flatMap((rs) =>
        rs.map((r) => r.memberEmail)
      ),
    ])
  );
  const memberBadgesEntries = await Promise.all(
    uniqueEmails.map(async (email) => {
      const m = await getMember(email).catch(() => null);
      return [
        email,
        {
          founderSlot: getFounderSlot(m),
          tierBadge: getTierBadge(m),
        },
      ] as const;
    })
  );
  const initialMemberBadges: Record<
    string,
    { founderSlot: number | null; tierBadge: TierBadge | null }
  > = Object.fromEntries(memberBadgesEntries);

  await setLastViewed(session.email).catch(() => null);

  const adminEmailNormalized =
    process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? null;

  return (
    <>
      {/* Cross-admin nav (including a Desk homing link) is rendered
          by the admin layout via AdminPersistentNav; no per-page
          wiring needed. */}
      <LoungeView
        initialPinned={pinned}
        initialPosts={posts}
        initialReplies={replies}
        initialReactions={reactions}
        initialMemberBadges={initialMemberBadges}
        initialHasMore={page.hasMore}
        initialReadByClayPostIds={readByClayPostIds}
        initialReadByClayReplyIds={readByClayReplyIds}
        adminEmail={adminEmailNormalized}
        lastVisitedAt={lastVisitedAt}
        isAdmin={true}
        activeNow={activeNow}
        authorCount={authorCount}
        launchIso={MEMBER_AREA_LAUNCH_ISO}
      />
    </>
  );
}

