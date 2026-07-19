import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { ensureDisplayName, getProfile, isAdmin } from "@/lib/comments";
import { getMember } from "@/lib/members";
import {
  createReply,
  isLoungeConfigured,
} from "@/lib/lounge";
import { createNotification } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id } = await params;

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
  // Optional attached image. Re-validated server-side in createReply.
  const rawMedia = (body as { media?: unknown })?.media;

  const adminUser = isAdmin(session.email);
  const fallback = session.email.split("@")[0] || "Member";

  // Same display-name gate as the top-level post route: a member with no
  // name yet must send one (the composer's inline field) and it becomes
  // their profile before the reply lands. Clay is exempt — his replies
  // render as "Clay" regardless — so he keeps the local-part fallback.
  let displayName: string;
  if (adminUser) {
    const profile = await getProfile(session.email).catch(() => null);
    displayName = profile?.displayName?.trim() || fallback;
  } else {
    const submittedName = (body as { displayName?: unknown })?.displayName;
    const named = await ensureDisplayName(
      session.email,
      typeof submittedName === "string" ? submittedName : null
    );
    if (!named.ok) {
      const status =
        named.error === "name_taken"
          ? 409
          : named.error === "storage_unavailable"
            ? 503
            : 400;
      return Response.json({ error: named.error }, { status });
    }
    displayName = named.displayName;
  }
  const member = adminUser
    ? null
    : await getMember(session.email).catch(() => null);
  // Store the full display name (createReply caps at 30), same as posts,
  // comments, the Guild, and the presence line. This used to keep only the
  // first word, which left replies reading "Mary" while the same member's
  // posts read "Mary Jane". Only affects new replies (the name is stamped
  // at write time).
  const firstName = displayName || fallback;
  const isFounder =
    !!member && member.tier === "founder" && typeof member.founderSlot === "number";

  const result = await createReply({
    parentPostId: id,
    memberEmail: session.email,
    firstName,
    isFounder,
    body: rawBody,
    isAdmin: adminUser,
    media: rawMedia,
  });

  if (!result.ok) {
    if (result.error === "rate_limited") {
      return Response.json(result, { status: 429 });
    }
    const status = result.error === "parent_not_found" ? 404 : 400;
    return Response.json(result, { status });
  }

  // Notify the parent-post author (unless they're replying to
  // themselves). Body is the reply text excerpt. Also fan out
  // `lounge_mention` notifications to anyone @-tagged in the body —
  // see resolveMentionToEmail for the resolution rules. Both kinds
  // ride the same fire-and-forget block so write latency doesn't
  // delay the API response.
  void (async () => {
    const reply = result.reply;
    const excerpt = reply.body
      ? reply.body.length > 60
        ? `${reply.body.slice(0, 60).trim()}…`
        : reply.body
      : "Shared a photo";

    // Parent-author notification.
    try {
      const { getPost } = await import("@/lib/lounge");
      const parent = await getPost(reply.parentPostId);
      if (parent && parent.memberEmail !== reply.memberEmail) {
        await createNotification({
          memberEmail: parent.memberEmail,
          type: "lounge_reply",
          title: `${reply.firstName} replied to your post`,
          body: excerpt,
          linkUrl: `/lounge#post-${parent.id}`,
        });
      }
    } catch (err) {
      console.error(`[notifications] lounge_reply write failed:`, err);
    }

    // Mentioned-member notifications. Self-mentions and a duplicate
    // mention of the parent-post author are both skipped — the latter
    // because the lounge_reply notification above already covers
    // that case and we don't want to double-tap.
    try {
      const tokens = parseMentions(reply.body);
      if (tokens.length === 0) return;
      const { getPost } = await import("@/lib/lounge");
      const parent = await getPost(reply.parentPostId);
      const parentAuthor = parent?.memberEmail ?? null;
      const notified = new Set<string>();
      for (const token of tokens) {
        const targetEmail = await resolveMentionToEmail(token);
        if (!targetEmail) continue;
        if (targetEmail === reply.memberEmail) continue;
        if (parentAuthor && targetEmail === parentAuthor) continue;
        if (notified.has(targetEmail)) continue;
        notified.add(targetEmail);
        await createNotification({
          memberEmail: targetEmail,
          type: "lounge_mention",
          title: `${reply.firstName} mentioned you in the lounge`,
          body: excerpt,
          linkUrl: `/lounge#post-${reply.parentPostId}`,
        });
      }
    } catch (err) {
      console.error(`[notifications] lounge_mention write failed:`, err);
    }
  })();

  return Response.json(result);
}
