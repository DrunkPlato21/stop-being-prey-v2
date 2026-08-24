import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";

// POST /api/arena/upload  multipart/form-data with `file`
// Stores an Arena specimen screenshot in Vercel Blob and returns its
// public URL. Clay-only: the Arena is a broadcast, and only the bench
// attaches images. The client (ArenaBench) downscales + re-encodes to
// WebP before sending, same pipeline as the Lounge's, so paste a 4MB
// phone screenshot and a few hundred KB arrive here.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || !isAdmin(session.email)) {
    return Response.json({ error: "not_authorized" }, { status: 403 });
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
    const blob = await put("arena/img", file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return Response.json({ ok: true, url: blob.url });
  } catch (err) {
    console.error("[arena/upload] blob upload failed:", err);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }
}
