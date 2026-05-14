import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import {
  isLoungeConfigured,
  isReactionKey,
  setReaction,
  type ReactionKey,
  type ReactionTarget,
} from "@/lib/lounge";
import { createNotification } from "@/lib/notifications";

// POST /api/lounge/react
//   body: { kind: "post" | "reply", id: string, reaction: ReactionKey | null }
// Set/replace/remove the caller's reaction. Passing the same key
// you already have toggles off (same as tapping the same FB emoji
// twice). Passing null explicitly clears.

export const runtime = "nodejs";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
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
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind;
  const id = b.id;
  if ((kind !== "post" && kind !== "reply") || typeof id !== "string") {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }
  const reactionRaw = b.reaction;
  let choice: ReactionKey | null;
  if (reactionRaw === null || reactionRaw === undefined) {
    choice = null;
  } else if (isReactionKey(reactionRaw)) {
    choice = reactionRaw;
  } else {
    return Response.json({ error: "invalid_reaction" }, { status: 400 });
  }
  const target: ReactionTarget = { kind, id };

  const result = await setReaction(target, session.email, choice);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 503;
    return Response.json({ error: result.error }, { status });
  }

  // Notify the target owner only when *adding* a reaction (not on
  // change-to-different or remove). Skip self-reacts.
  if (
    result.added &&
    result.targetMemberEmail &&
    result.targetMemberEmail !== session.email.toLowerCase().trim()
  ) {
    void (async () => {
      try {
        const profile = await getProfile(session.email).catch(() => null);
        const fallback = session.email.split("@")[0] || "Member";
        const firstName =
          firstWord(profile?.displayName?.trim() || fallback) || fallback;
        const excerpt =
          result.bodySnapshot.length > 60
            ? `${result.bodySnapshot.slice(0, 60).trim()}…`
            : result.bodySnapshot;
        const targetLabel = kind === "reply" ? "reply" : "post";
        await createNotification({
          memberEmail: result.targetMemberEmail,
          type: "lounge_reaction",
          title: `${firstName} reacted to your ${targetLabel}`,
          body: excerpt,
          linkUrl: `/lounge#post-${result.parentPostId}`,
        });
      } catch (err) {
        console.error(`[notifications] lounge_reaction write failed:`, err);
      }
    })();
  }

  return Response.json({
    ok: true,
    counts: result.counts,
    total: result.total,
    myReaction: result.myReaction,
  });
}
