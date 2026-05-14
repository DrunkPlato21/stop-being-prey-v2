import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  getFounderSlot,
  getMember,
  getTierBadge,
  type TierBadge,
} from "@/lib/members";
import {
  createPost,
  getLastViewed,
  getPinnedPost,
  isLoungeConfigured,
  listVisiblePosts,
  listVisibleReplies,
  reactionSnapshots,
  setLastViewed,
  type ReactionTarget,
} from "@/lib/lounge";

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
  const targets: ReactionTarget[] = [];
  for (const p of allPosts) {
    targets.push({ kind: "post", id: p.id });
    for (const r of replies[p.id]) {
      targets.push({ kind: "reply", id: r.id });
    }
  }
  const reactions = await reactionSnapshots(session.email, targets);

  // Per-author badge map for the visible page. Looked up live (no
  // baked-in field on the post record) so a tier change is reflected
  // across all of that member's historical posts on the next poll.
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
  const memberBadges: Record<
    string,
    { founderSlot: number | null; tierBadge: TierBadge | null }
  > = Object.fromEntries(memberBadgesEntries);

  const adminUser = isAdmin(session.email);

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

  const identity = await resolveIdentity(session.email);
  const result = await createPost({
    memberEmail: session.email,
    firstName: identity.firstName,
    isFounder: identity.isFounder,
    body: rawBody,
    isAdmin: identity.isAdmin,
  });

  if (!result.ok) {
    if (result.error === "rate_limited") {
      return Response.json(result, { status: 429 });
    }
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}
