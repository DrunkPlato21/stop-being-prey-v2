import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import { getMember } from "@/lib/members";
import {
  createReply,
  isLoungeConfigured,
} from "@/lib/lounge";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

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

  const adminUser = isAdmin(session.email);
  const fallback = session.email.split("@")[0] || "Member";
  const [profile, member] = await Promise.all([
    getProfile(session.email).catch(() => null),
    adminUser
      ? Promise.resolve(null)
      : getMember(session.email).catch(() => null),
  ]);
  const displayName = profile?.displayName?.trim() || fallback;
  const firstName = firstWord(displayName) || fallback;
  const isFounder =
    !!member && member.tier === "founder" && typeof member.founderSlot === "number";

  const result = await createReply({
    parentPostId: id,
    memberEmail: session.email,
    firstName,
    isFounder,
    body: rawBody,
    isAdmin: adminUser,
  });

  if (!result.ok) {
    if (result.error === "rate_limited") {
      return Response.json(result, { status: 429 });
    }
    const status = result.error === "parent_not_found" ? 404 : 400;
    return Response.json(result, { status });
  }

  // Notify the parent-post author (unless they're replying to
  // themselves). Body is the reply text excerpt.
  void (async () => {
    try {
      const reply = result.reply;
      // Fetch parent to get owner email.
      const { getPost } = await import("@/lib/lounge");
      const parent = await getPost(reply.parentPostId);
      if (!parent) return;
      if (parent.memberEmail === reply.memberEmail) return;
      const excerpt =
        reply.body.length > 60 ? `${reply.body.slice(0, 60).trim()}…` : reply.body;
      await createNotification({
        memberEmail: parent.memberEmail,
        type: "lounge_reply",
        title: `${reply.firstName} replied to your post`,
        body: excerpt,
        linkUrl: `/lounge#post-${parent.id}`,
      });
    } catch (err) {
      console.error(
        `[notifications] lounge_reply write failed:`,
        err
      );
    }
  })();

  return Response.json(result);
}
