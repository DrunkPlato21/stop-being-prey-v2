import { getArchiveReader } from "@/lib/email-archive";
import { getMarkedKitIds, setEmailMark, type MarkKind } from "@/lib/email-reads";

// Shared handlers behind /api/emails/read and /api/emails/favorite:
//
//   GET                       -> { ids: number[] }  (Kit ids)
//   POST { kitId, on: bool }  -> { ok, on }
//
// The caller's own marks in the patron email archive. Patrons only;
// keyed by the session's member email, so it's the same list on every
// device they sign in on.

function devPreview(req: Request) {
  return new URL(req.url).searchParams.get("dev_preview");
}

export function markHandlers(kind: MarkKind) {
  async function GET(req: Request) {
    const reader = await getArchiveReader(devPreview(req));
    if (!reader) {
      return Response.json({ error: "patrons only" }, { status: 403 });
    }
    const ids = await getMarkedKitIds(kind, reader.email);
    return Response.json({ ids }, { headers: { "Cache-Control": "no-store" } });
  }

  async function POST(req: Request) {
    const reader = await getArchiveReader(devPreview(req));
    if (!reader) {
      return Response.json({ error: "patrons only" }, { status: 403 });
    }
    let body: { kitId?: unknown; on?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    const kitId = Number(body.kitId);
    if (!Number.isSafeInteger(kitId) || kitId <= 0 || typeof body.on !== "boolean") {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    const ok = await setEmailMark(kind, reader.email, kitId, body.on);
    return Response.json({ ok, on: body.on }, { status: ok ? 200 : 503 });
  }

  return { GET, POST };
}
