import type { NextRequest } from "next/server";
import {
  isNotesConfigured,
  listAll,
  type NoteStatus,
} from "@/lib/notes";

// Admin queue list. Gated by HTTP Basic auth via proxy.ts on
// /api/admin/*. Single filter:
//   ?status=active|new|read|replied|archived|all  (default: active)
// Visibility filter dropped — all notes are public now.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isNotesConfigured()) {
    return Response.json({ notes: [] });
  }

  const url = req.nextUrl;
  const statusParam = url.searchParams.get("status");

  const allowed: (NoteStatus | "all" | "active")[] = [
    "active",
    "all",
    "new",
    "read",
    "replied",
    "archived",
  ];
  const status = allowed.includes(
    statusParam as NoteStatus | "all" | "active"
  )
    ? (statusParam as NoteStatus | "all" | "active")
    : "active";

  const notes = await listAll({ status });
  return Response.json({ notes });
}
