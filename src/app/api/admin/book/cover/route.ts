import type { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { saveBook } from "@/lib/book";

// POST /api/admin/book/cover  multipart/form-data with `file`
// Uploads the book cover image to Vercel Blob, saves the public URL
// onto the book record, returns the URL.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const fileField = form.get("file");
  if (!(fileField instanceof Blob) || !("size" in fileField)) {
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

  let url: string;
  try {
    const blob = await put("book/cover", file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    url = blob.url;
  } catch (err) {
    console.error("[book/cover] blob upload failed:", err);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }

  const saved = await saveBook({ coverUrl: url });
  return Response.json({ ok: true, coverUrl: url, book: saved });
}
