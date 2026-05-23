import type { NextRequest } from "next/server";
import {
  addWatchPost,
  isWatchFeedConfigured,
  listWatchPosts,
} from "@/lib/watch-feed";

// Admin endpoints for The Watch Feed. Gated by proxy.ts via HTTP Basic
// auth on /api/admin/*.
//   GET    → recent posts (for the admin form's "recent posts" list)
//   POST   { body, link? } → push a new post

export const runtime = "nodejs";

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const posts = await listWatchPosts(20);
  return Response.json({ ok: true, posts });
}

export async function POST(req: NextRequest) {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawBody = (payload as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }

  const rawLink = (payload as { link?: unknown })?.link;
  const link = typeof rawLink === "string" ? rawLink : undefined;

  // Admin Basic auth doesn't carry an identity beyond the env password,
  // so the host email is sourced from ADMIN_EMAIL when present and a
  // sentinel otherwise. Purely informational; not used for gating.
  const hostEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? "host";

  const result = await addWatchPost({ body: rawBody, link, hostEmail });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, post: result.post });
}
