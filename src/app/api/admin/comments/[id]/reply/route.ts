import { NextResponse } from "next/server";
import { deleteReply, setReply } from "@/lib/comments";

// POST /api/admin/comments/:id/reply  body: { body }
// DELETE /api/admin/comments/:id/reply
// Admin-gated reply mutation. Same Basic-auth gate as the delete /
// approve siblings, same ADMIN_EMAIL pass-through for the actor.

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "admin_not_configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawBody = (body as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }

  const result = await setReply(id, adminEmail, rawBody);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "empty_body"
            ? 400
            : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, comment: result.comment });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "admin_not_configured" },
      { status: 503 }
    );
  }
  const result = await deleteReply(id, adminEmail);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
