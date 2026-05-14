import { NextResponse } from "next/server";
import { approveComment } from "@/lib/comments";

// POST /api/admin/comments/:id/approve
// Admin-gated approve. Same Basic-auth model as the delete sibling.

export const runtime = "nodejs";

export async function POST(
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

  const result = await approveComment(id, adminEmail);
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
