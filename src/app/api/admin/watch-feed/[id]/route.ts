import type { NextRequest } from "next/server";
import { deleteWatchPost, isWatchFeedConfigured } from "@/lib/watch-feed";

// DELETE /api/admin/watch-feed/[id] — remove a watch post by id.

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const result = await deleteWatchPost(id);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 503;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
