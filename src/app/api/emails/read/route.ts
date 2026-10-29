import { getArchiveReader } from "@/lib/email-archive";
import { getReadKitIds, setEmailRead } from "@/lib/email-reads";

// GET  /api/emails/read             -> { read: number[] }  (Kit ids)
// POST /api/emails/read  { kitId, read: boolean }  -> { ok, read }
//
// The caller's own read marks in the patron email archive. Patrons only;
// keyed by the session's member email, so it's the same list on every
// device they sign in on.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function devPreview(req: Request) {
  return new URL(req.url).searchParams.get("dev_preview");
}

export async function GET(req: Request) {
  const reader = await getArchiveReader(devPreview(req));
  if (!reader) {
    return Response.json({ error: "patrons only" }, { status: 403 });
  }
  const read = await getReadKitIds(reader.email);
  return Response.json({ read }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const reader = await getArchiveReader(devPreview(req));
  if (!reader) {
    return Response.json({ error: "patrons only" }, { status: 403 });
  }
  let body: { kitId?: unknown; read?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const kitId = Number(body.kitId);
  if (!Number.isSafeInteger(kitId) || kitId <= 0 || typeof body.read !== "boolean") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const ok = await setEmailRead(reader.email, kitId, body.read);
  return Response.json({ ok, read: body.read }, { status: ok ? 200 : 503 });
}
