import type { NextRequest } from "next/server";
import {
  BOOK_STATUSES,
  isBookConfigured,
  saveBook,
  type BookStatus,
  type ChapterEntry,
  type SaveInput,
} from "@/lib/book";

// POST /api/admin/book  — save book metadata
// Body: partial SaveInput. Any field omitted keeps its prior value.
// Pass coverUrl: null / excerpt: null / chapters: null / preorderUrl: null
// to clear those optional fields.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.

export const runtime = "nodejs";

function isBookStatus(v: unknown): v is BookStatus {
  return (
    typeof v === "string" &&
    (BOOK_STATUSES as readonly string[]).includes(v)
  );
}

export async function POST(req: NextRequest) {
  if (!isBookConfigured()) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_body" },
      { status: 400 }
    );
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: SaveInput = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.subtitle === "string") patch.subtitle = b.subtitle;
  if (typeof b.description === "string") patch.description = b.description;
  if (isBookStatus(b.status)) patch.status = b.status;

  // Nullable fields: explicit null clears, string sets, omitted keeps.
  if (b.coverUrl === null) patch.coverUrl = null;
  else if (typeof b.coverUrl === "string") patch.coverUrl = b.coverUrl;

  if (b.excerpt === null) patch.excerpt = null;
  else if (typeof b.excerpt === "string") patch.excerpt = b.excerpt;

  if (b.preorderUrl === null) patch.preorderUrl = null;
  else if (typeof b.preorderUrl === "string") patch.preorderUrl = b.preorderUrl;

  if (b.chapters === null) {
    patch.chapters = null;
  } else if (Array.isArray(b.chapters)) {
    patch.chapters = b.chapters
      .map((c) => {
        if (typeof c !== "object" || c === null) return null;
        const obj = c as Record<string, unknown>;
        if (typeof obj.title !== "string") return null;
        return {
          title: obj.title,
          status: typeof obj.status === "string" ? obj.status : "",
        };
      })
      .filter((c): c is ChapterEntry => c !== null);
  }

  const saved = await saveBook(patch);
  return Response.json({ ok: true, book: saved });
}
