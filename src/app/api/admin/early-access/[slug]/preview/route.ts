import { NextResponse, type NextRequest } from "next/server";
import { checkEssaySource, earlyAccessFileExists } from "@/lib/early-access";

// POST /api/admin/early-access/[slug]/preview
//
// Takes draft markdown ({ raw }) in the body and returns the rendered
// preview the same way the live page would render it — same
// checkEssaySource()/renderEssayBody() pipeline — plus any validation
// errors/warnings. The editor calls this on a debounce while typing so
// the preview pane always reflects exactly what production will show.
//
// Localhost-only via proxy.ts. Read-only (no disk writes), so unlike the
// PUT save it doesn't need the extra dev-only guard.

export const dynamic = "force-dynamic";

type Body = { raw?: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!earlyAccessFileExists(slug)) {
    return NextResponse.json({ error: "unknown_slug" }, { status: 404 });
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const raw = typeof payload.raw === "string" ? payload.raw : "";
  const check = await checkEssaySource(raw);
  return NextResponse.json(check);
}
