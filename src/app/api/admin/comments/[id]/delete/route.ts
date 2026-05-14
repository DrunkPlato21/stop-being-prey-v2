import { NextResponse } from "next/server";
import { deleteComment } from "@/lib/comments";

// POST /api/admin/comments/:id/delete
// Admin-gated delete. Lives under /api/admin/* so it inherits the
// proxy's HTTP Basic auth instead of needing a member session
// cookie. The underlying lib call requires an actorEmail that
// satisfies isAdmin(); we read ADMIN_EMAIL from the environment
// (same source isAdmin checks against) so the comment record is
// torn down properly.

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

  const result = await deleteComment(id, adminEmail);
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
