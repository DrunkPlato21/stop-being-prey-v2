import type { NextRequest } from "next/server";
import {
  deleteChannelPost,
  isChannelPostsConfigured,
} from "@/lib/channel-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isChannelPostsConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const result = await deleteChannelPost(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
