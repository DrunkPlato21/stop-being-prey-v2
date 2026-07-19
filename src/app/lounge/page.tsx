import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  bumpActiveNow,
  countLoungeAuthors,
  getActiveNow,
  getLastViewed,
  getPinnedPost,
  getReadByClayPostIds,
  getReadByClayReplyIds,
  getRoomPresence,
  getRoomPresenceFloor,
  listRecentArrivals,
  listVisiblePosts,
  listVisibleReplies,
  MEMBER_AREA_LAUNCH_ISO,
  reactionSnapshots,
  setLastViewed,
  type LoungePost,
  type LoungeReply,
  type ReactionTarget,
  type RoomPresence,
} from "@/lib/lounge";
import { isWatchFeedEnabled, listWatchPosts } from "@/lib/watch-feed";
import {
  getCharterSlot,
  getFounderSlot,
  getMembersByEmails,
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

  const [pinned, page, lastVisitedAt, activeNow, authorCount, roomFloor] =
    await Promise.all([
      getPinnedPost(),
      listVisiblePosts({ limit: INITIAL_PAGE }),
      getLastViewed(session.email),
      getActiveNow(session.email, isAdmin),
      countLoungeAuthors(),
      getRoomPresenceFloor(),
    ]);

  // "Who's in the room" indicator (count + names), gated by the
  // admin-set floor so a thin room never shows. getRoomPresence skips
  // the profile lookup when below the floor, so this stays cheap on a
  // quiet day. Re-gate on the resolved total in case it differs from
  // the active-now snapshot read just above.
  const roomPresenceRaw = await getRoomPresence({
    viewerEmail: session.email,
    floor: roomFloor,
  });
  const roomPresence: RoomPresence | null =
    roomPresenceRaw.total >= roomFloor ? roomPresenceRaw : null;

  // Watch Feed banner state. Off by default; only pay for the posts +
  // arrivals reads when the toggle is actually on.
  const watchEnabled = await isWatchFeedEnabled();
  const [watchPosts, watchArrivals] = watchEnabled
    ? await Promise.all([listWatchPosts(50), listRecentArrivals({})])
    : [[], []];

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
  // One batched MGET for every author's record instead of a fan-out of
  // one getMember per unique email — the same shape the /api/lounge GET
  // already uses. On a busy thread this collapses N Redis round-trips
  // into one, which was a meaningful chunk of the page's first-paint
  // latency.
  const memberMap = await getMembersByEmails(uniqueEmails);
  const initialMemberBadges: Record<
    string,
    {
      founderSlot: number | null;
      charterSlot: number | null;
      tierBadge: TierBadge | null;
    }
  > = {};
  for (const email of uniqueEmails) {
    const m = memberMap.get(email.toLowerCase().trim()) ?? null;
    initialMemberBadges[email] = {
      founderSlot: getFounderSlot(m),
      charterSlot: getCharterSlot(m),
      tierBadge: getTierBadge(m),
    };
  }

  const adminUser = isAdmin(session.email);
  const adminEmailNormalized =
    process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? null;

  // Does the viewer have a display name yet? The composer reveals an inline
  // name field when not (and the server gate requires it). Admin is always
  // treated as named — his posts render as "Clay".
  const viewerProfile = adminUser
    ? null
    : await getProfile(session.email).catch(() => null);
  const viewerHasDisplayName =
    adminUser || !!viewerProfile?.displayName?.trim();

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
      viewerEmail={session.email}
      lastVisitedAt={lastVisitedAt}
      isAdmin={adminUser}
      activeNow={activeNow}
      roomPresence={roomPresence}
      initialWatchPosts={watchPosts}
      initialWatchArrivals={watchArrivals}
      initialWatchEnabled={watchEnabled}
      authorCount={authorCount}
      launchIso={MEMBER_AREA_LAUNCH_ISO}
      viewerHasDisplayName={viewerHasDisplayName}
    />
  );
}
