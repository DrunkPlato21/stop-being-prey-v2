import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { checkUploadQuota, isLoungeConfigured } from "@/lib/lounge";

// POST /api/lounge/upload  multipart/form-data with `file`
// Stores a lounge image in Vercel Blob and returns its public URL.
// The CLIENT downscales + re-encodes to WebP before sending, so this
// stays small (storage stays cheap). The post itself carries the URL +
// dimensions; createPost validates the URL is from our own Blob store.

export const runtime = "nodejs";
export const maxDuration = 60;

// Generous ceiling: a resized WebP is ~100-400KB, so anything bigger is
// either an un-resized client or junk. Hard cap below, not a target.
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Rolling daily cap per member, so uploads can't outrun the post flow.
  const underQuota = await checkUploadQuota(session.email);
  if (!underQuota) {
    return Response.json({ error: "daily_limit" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const fileField = form.get("file");
  if (!(fileField instanceof Blob)) {
    return Response.json({ error: "missing_file" }, { status: 400 });
  }
  const file = fileField as File;
  if (file.size === 0) {
    return Response.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "file_too_large" }, { status: 413 });
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return Response.json({ error: "invalid_type" }, { status: 400 });
  }

  try {
    const blob = await put("lounge/img", file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return Response.json({ ok: true, url: blob.url });
  } catch (err) {
    console.error("[lounge/upload] blob upload failed:", err);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }
}
