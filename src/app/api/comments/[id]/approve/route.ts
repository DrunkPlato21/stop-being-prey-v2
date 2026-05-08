import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { approveComment } from "@/lib/comments";

// POST /api/comments/:id/approve — admin-only. Flips approved=true and
// removes the comment from the global pending index.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const result = await approveComment(id, session.email);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ comment: result.comment });
}
