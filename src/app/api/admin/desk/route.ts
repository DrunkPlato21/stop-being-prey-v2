import type { NextRequest } from "next/server";
import { addUpdate, deleteUpdate, isDeskConfigured } from "@/lib/desk";

// Admin endpoint for the Writer's Desk. Gated by proxy.ts via
// HTTP Basic auth on /api/admin/*. Two verbs:
//   POST   { body } → add a new update
//   DELETE { id }   → remove an update by id

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isDeskConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawBody = (body as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }

  const result = await addUpdate(rawBody);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, update: result.update });
}

export async function DELETE(req: NextRequest) {
  if (!isDeskConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const id = (body as { id?: unknown })?.id;
  if (typeof id !== "string" || id.length === 0) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }

  const result = await deleteUpdate(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
