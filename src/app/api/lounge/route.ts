import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMember,
  getMembersByEmails,
  getTierBadge,
  type TierBadge,
} from "@/lib/members";
import {
  bumpActiveNow,
  createPost,
  getLastViewed,
  getPinnedPost,
  getRoomPresence,
  getRoomPresenceFloor,
  isLoungeConfigured,
  listVisiblePosts,
  listVisibleReplies,
  reactionSnapshots,
  revealDuePrompts,
  setLastViewed,
  type ReactionTarget,
  type RoomPresence,
} from "@/lib/lounge";
import { createNotification } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";

// GET  /api/lounge?before=<createdAt>&limit=20
//   → { pinned, posts, replies, reacted, lastVisitedAt, hasMore, isAdmin }
// POST /api/lounge   body: { body: string }
//   → { ok, post } or { error, ... }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

async function resolveIdentity(email: string): Promise<{
  firstName: string;
  isFounder: boolean;
  isAdmin: boolean;
}> {
  const adminUser = isAdmin(email);
  const fallback = email.split("@")[0] || "Member";
  if (adminUser) {
    const profile = await getProfile(email).catch(() => null);
    const displayName = profile?.displayName?.trim() || fallback;
    return {
      firstName: firstWord(displayName) || fallback,
      isFounder: false,
      isAdmin: true,
    };
  }
  const [profile, member] = await Promise.all([
    getProfile(email).catch(() => null),
    getMember(email).catch(() => null),
  ]);
  const displayName = profile?.displayName?.trim() || fallback;
  return {
    firstName: firstWord(displayName) || fallback,
    isFounder: member?.tier === "founder" && typeof member.founderSlot === "number",
    isAdmin: false,
  };
}

export async function GET(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = req.nextUrl;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 20;
  const rawBefore = url.searchParams.get("before");
  const before = rawBefore ? Number.parseInt(rawBefore, 10) : undefined;

  // Heartbeat. The lounge polls this endpoint every ~5-20s, so
  // re-stamp the caller's active-now presence here — otherwise an idle
  // member (sitting and watching, not clicking) silently drops out of
  // the 5-minute window and the "in the room" count collapses mid-
  // event. Only on the live first page; pagination isn't presence.
  if (!before) {
    await bumpActiveNow(session.email).catch(() => null);
    // Traffic-driven reveal of any scheduled prompts now due. The
    // atomic per-prompt claim inside makes concurrent polls safe, so
    // each prompt posts exactly once. Fire-and-forget: a slow reveal
    // shouldn't delay the poll response.
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    if (adminEmail) {
      void revealDuePrompts({ hostEmail: adminEmail }).catch(() => 0);
    }
  }

  const [pinned, page, lastVisitedAt] = await Promise.all([
    typeof before === "number" ? Promise.resolve(null) : getPinnedPost(),
    listVisiblePosts({
      limit: Number.isFinite(limit) ? limit : 20,
      before: typeof before === "number" && Number.isFinite(before) ? before : undefined,
    }),
    getLastViewed(session.email),
  ]);

  // Don't double-render the pinned post inside the feed.
  const posts = pinned
    ? page.posts.filter((p) => p.id !== pinned.id)
    : page.posts;
  const allPosts = pinned ? [pinned, ...posts] : posts;

  // Fetch replies for every visible post in parallel.
  const replyLists = await Promise.all(
    allPosts.map((p) => listVisibleReplies(p.id, 50))
  );
  const replies: Record<string, typeof replyLists[number]> = {};
  allPosts.forEach((p, i) => {
    replies[p.id] = replyLists[i];
  });

  // Build the per-viewer reaction snapshot for everything visible.
  // Pass the denormalized reactionCount with each target so the helper
  // can skip the Redis HGETALL for targets with no reactions yet —
  // most posts on a busy feed.
  const targets: ReactionTarget[] = [];
  for (const p of allPosts) {
    targets.push({ kind: "post", id: p.id, reactionCount: p.reactionCount });
    for (const r of replies[p.id]) {
      targets.push({
        kind: "reply",
        id: r.id,
        reactionCount: r.reactionCount,
      });
    }
  }
  const reactions = await reactionSnapshots(session.email, targets);

  // Per-author badge map for the visible page. Looked up live (no
  // baked-in field on the post record) so a tier change is reflected
  // across all of that member's historical posts on the next poll.
  // Batched via MGET so a busy thread doesn't fan out one Redis call
  // per unique author — see the 2026-05-18 rate-limit incident.
  const uniqueEmails = Array.from(
    new Set([
      session.email.toLowerCase().trim(),
      ...allPosts.map((p) => p.memberEmail),
      ...Object.values(replies).flatMap((rs) =>
        rs.map((r) => r.memberEmail)
      ),
    ])
  );
  const memberMap = await getMembersByEmails(uniqueEmails);
  const memberBadges: Record<
    string,
    {
      founderSlot: number | null;
      charterSlot: number | null;
      tierBadge: TierBadge | null;
    }
  > = {};
  for (const email of uniqueEmails) {
    const m = memberMap.get(email.toLowerCase().trim()) ?? null;
    memberBadges[email] = {
      founderSlot: getFounderSlot(m),
      charterSlot: getCharterSlot(m),
      tierBadge: getTierBadge(m),
    };
  }

  const adminUser = isAdmin(session.email);

  // Room-presence indicator payload (count + names), floor-gated so a
  // thin room shows nothing. Only on the live first page; null below
  // the floor. Lets the lounge keep the line live across polls without
  // a full reload. The floor read is one cheap GET; getRoomPresence
  // skips the profile lookup entirely when below the floor.
  let roomPresence: RoomPresence | null = null;
  if (!before) {
    const floor = await getRoomPresenceFloor();
    const presence = await getRoomPresence({
      viewerEmail: session.email,
      floor,
    });
    roomPresence = presence.total >= floor ? presence : null;
  }

  // Bump last-viewed AFTER the snapshot is built so NEW indicators
  // for the current request still reflect the prior visit.
  if (!before) {
    await setLastViewed(session.email).catch(() => null);
  }

  return Response.json(
    {
      ok: true,
      pinned,
      posts,
      replies,
      reactions,
      memberBadges,
      lastVisitedAt,
      hasMore: page.hasMore,
      isAdmin: adminUser,
      roomPresence,
    },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawBody = (body as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }
  // Raw media descriptor; createPost validates (image must be our Blob,
  // YouTube is re-derived from the body, never trusted from the client).
  const rawMedia = (body as { media?: unknown })?.media;

  const identity = await resolveIdentity(session.email);
  const result = await createPost({
    memberEmail: session.email,
    firstName: identity.firstName,
    isFounder: identity.isFounder,
    body: rawBody,
    isAdmin: identity.isAdmin,
    media: rawMedia,
  });

  if (!result.ok) {
    if (result.error === "rate_limited") {
      return Response.json(result, { status: 429 });
    }
    return Response.json(result, { status: 400 });
  }

  // Fan out `lounge_mention` notifications to anyone @-tagged in the
  // post body. Mirrors the reply route's mention block, minus the
  // parent-author dedupe (top-level posts have no parent author to
  // double-tap). Self-mentions are skipped — drafting your own name
  // doesn't ping you.
  void (async () => {
    try {
      const post = result.post;
      const tokens = parseMentions(post.body);
      if (tokens.length === 0) return;
      const excerpt =
        post.body.length > 60
          ? `${post.body.slice(0, 60).trim()}…`
          : post.body;
      const notified = new Set<string>();
      for (const token of tokens) {
        const targetEmail = await resolveMentionToEmail(token);
        if (!targetEmail) continue;
        if (targetEmail === post.memberEmail) continue;
        if (notified.has(targetEmail)) continue;
        notified.add(targetEmail);
        await createNotification({
          memberEmail: targetEmail,
          type: "lounge_mention",
          title: `${post.firstName} mentioned you in the lounge`,
          body: excerpt,
          linkUrl: `/lounge#post-${post.id}`,
        });
      }
    } catch (err) {
      console.error(`[notifications] lounge_mention write failed:`, err);
    }
  })();

  return Response.json(result);
}
