import type { NextRequest } from "next/server";
import {
  isLoungeConfigured,
  setReadByClay,
  type ReadByClayTarget,
} from "@/lib/lounge";

// POST /api/admin/lounge/read
// Body: { kind: "post" | "reply", id: string, read: boolean }
//
// Toggle the "Read by Clay" receipt on a single post or reply.
// Basic-auth gated by proxy.ts — only Clay's localhost admin
// instance can reach this endpoint. The data lives in shared
// Upstash storage, so production members see the receipts even
// though admin actions only happen from Clay's machine.

export const runtime = "nodejs";

function isKind(value: unknown): value is "post" | "reply" {
  return value === "post" || value === "reply";
}

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const kind = obj.kind;
  const id = obj.id;
  const read = obj.read;

  if (!isKind(kind)) {
    return Response.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (typeof id !== "string" || id.length === 0) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  if (typeof read !== "boolean") {
    return Response.json({ error: "invalid_read" }, { status: 400 });
  }

  const target: ReadByClayTarget = { kind, id };
  const result = await setReadByClay(target, read);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 503 });
  }
  return Response.json({ ok: true, kind, id, read: result.read });
}
