import type { NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { deleteWatchPost, isWatchFeedConfigured } from "@/lib/watch-feed";

// DELETE /api/admin/watch-feed/[id] — remove a watch post by id. If the
// post was a voice note, its audio object in Vercel Blob is freed too.

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
  // Best-effort blob cleanup for voice notes. A missing/already-gone
  // object isn't fatal — the record is gone, which is what was asked.
  if (result.post?.audioUrl) {
    try {
      await del(result.post.audioUrl);
    } catch (err) {
      console.warn("watch-feed voice blob delete failed (ignored)", err);
    }
  }
  return Response.json({ ok: true });
}
