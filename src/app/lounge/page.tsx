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
  getCharterSlot,
  getFounderSlot,
  getMember,
  getTierBadge,
  type TierBadge,
} from "@/lib/members";
import { LoungeView } from "@/components/LoungeView";

export const metadata: Metadata = {
  title: "The Lounge",
  description:
    "Members talking to members. Clay drops in when something earns it.",
};

export const dynamic = "force-dynamic";

const INITIAL_PAGE = 20;

export default async function LoungePage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/lounge");
  }

  // Record this view in the active-now ZSET before the snapshot is
  // read so the caller's own presence doesn't decay between writes.
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

  // Resolve per-author badge info (founder slot + current tier badge)
  // at render time so a member who upgraded mid-thread shows the new
  // badge across every prior post they made. Cheap getMember per
  // unique email at typical lounge volumes.
  const uniqueEmails = Array.from(
    new Set([
      // Always include the viewer so their first post / reply renders
      // with the correct badge before the next page load refreshes
      // the map.
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
          charterSlot: getCharterSlot(m),
          tierBadge: getTierBadge(m),
        },
      ] as const;
    })
  );
  const initialMemberBadges: Record<
    string,
    {
      founderSlot: number | null;
      charterSlot: number | null;
      tierBadge: TierBadge | null;
    }
  > = Object.fromEntries(memberBadgesEntries);

  const adminUser = isAdmin(session.email);
  const adminEmailNormalized =
    process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? null;

  // Bump last-viewed after the snapshot is built so the current
  // request's NEW indicators still reflect the prior visit.
  await setLastViewed(session.email).catch(() => null);

  return (
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
      isAdmin={adminUser}
      activeNow={activeNow}
      authorCount={authorCount}
      launchIso={MEMBER_AREA_LAUNCH_ISO}
    />
  );
}
