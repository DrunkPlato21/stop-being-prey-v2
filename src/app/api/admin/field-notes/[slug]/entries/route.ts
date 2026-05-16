import { NextResponse, type NextRequest } from "next/server";
import { appendEntry } from "@/lib/field-notes";

// POST /api/admin/field-notes/[slug]/entries
//
// Appends an entry to a journal-style Field Note. Gated by proxy.ts
// HTTP Basic auth on /api/admin/* and additionally locked to
// localhost in production (proxy.ts returns 404 in prod). All Field
// Note authorship is intended to happen on Clay's dev machine.

export const dynamic = "force-dynamic";

type Body = {
  date?: string; // ISO date string or "YYYY-MM-DD"
  title?: string;
  body?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!title || !body) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Resolve the date. If absent or unparseable, default to "now".
  let dateMs = Date.now();
  if (typeof payload.date === "string" && payload.date.trim().length > 0) {
    const t = Date.parse(payload.date);
    if (!Number.isNaN(t)) dateMs = t;
  }

  const result = await appendEntry({ slug, date: dateMs, title, body });
  if (!result.ok) {
    const status =
      result.error === "unknown_slug"
        ? 404
        : result.error === "storage_unavailable"
          ? 503
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ entry: result.entry }, { status: 201 });
}
