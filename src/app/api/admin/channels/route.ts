import type { NextRequest } from "next/server";
import {
  createChannelPost,
  isChannelPostsConfigured,
  listChannelPosts,
  type ChannelSource,
} from "@/lib/channel-posts";

// Admin endpoint for the unified social-post feed (Facebook + X +
// YouTube). Gated by proxy.ts HTTP Basic Auth on /api/admin/*.
//
//   POST { source, url, text, postedAt } → create
//   GET                                  → list (combined newest-first)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSource(v: unknown): v is ChannelSource {
  return v === "fb" || v === "x" || v === "youtube";
}

export async function GET() {
  if (!isChannelPostsConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const posts = await listChannelPosts({ limit: 100 });
  return Response.json({ ok: true, posts });
}

export async function POST(req: NextRequest) {
  if (!isChannelPostsConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const source = b.source;
  const url = typeof b.url === "string" ? b.url : "";
  const text = typeof b.text === "string" ? b.text : "";
  const postedAt = typeof b.postedAt === "string" ? b.postedAt : "";

  if (!isSource(source)) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }
  if (!url || !text || !postedAt) {
    return Response.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await createChannelPost({ source, url, text, postedAt });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, post: result.post });
}
