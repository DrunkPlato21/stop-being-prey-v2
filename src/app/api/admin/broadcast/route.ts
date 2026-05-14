import type { NextRequest } from "next/server";
import { listActiveMemberEmails } from "@/lib/members";
import { createForMembers } from "@/lib/notifications";

// Manual broadcast endpoint for content that lives on the file
// system (essays, Field Notes, walls). Clay fires this after a
// deploy that publishes new content. Gated by proxy.ts via HTTP
// Basic auth on /api/admin/*.
//
// POST { type: "essay" | "wall_opened", title, body, linkUrl }
//   - title: ≤80 chars
//   - body: ≤120 chars excerpt or context line
//   - linkUrl: where the notification clicks through to
//
// Fans out to every active member synchronously. At <500 members
// this is fine; if the list grows past that, batch off the request
// path.

export const runtime = "nodejs";
export const maxDuration = 60;

type AllowedType = "essay" | "wall_opened";

const ALLOWED_TYPES: AllowedType[] = ["essay", "wall_opened"];

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const type = b.type as unknown;
  if (typeof type !== "string" || !ALLOWED_TYPES.includes(type as AllowedType)) {
    return Response.json({ error: "invalid_type" }, { status: 400 });
  }
  const title = typeof b.title === "string" ? b.title : "";
  const bodyExcerpt = typeof b.body === "string" ? b.body : "";
  const linkUrl = typeof b.linkUrl === "string" ? b.linkUrl : "";
  if (!title.trim() || !linkUrl.trim()) {
    return Response.json(
      { error: "missing_fields" },
      { status: 400 }
    );
  }

  const emails = await listActiveMemberEmails();
  const sent = await createForMembers(emails, {
    type: type as AllowedType,
    title,
    body: bodyExcerpt,
    linkUrl,
  });

  return Response.json({ ok: true, sent, recipients: emails.length });
}
