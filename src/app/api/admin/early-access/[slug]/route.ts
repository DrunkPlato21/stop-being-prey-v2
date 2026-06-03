import { NextResponse, type NextRequest } from "next/server";
import {
  checkEssaySource,
  earlyAccessFileExists,
  readEssayRaw,
  writeEssayRaw,
} from "@/lib/early-access";

// GET  /api/admin/early-access/[slug]  -> raw markdown for the editor
// PUT  /api/admin/early-access/[slug]  -> overwrite the markdown file
//
// Gated to localhost by proxy.ts (the whole /api/admin/* surface 404s in
// production). The PUT additionally refuses to run outside development:
// it writes to the working-tree filesystem, which only makes sense on
// Clay's dev machine. The live (Vercel) filesystem is read-only anyway,
// so the essay is always authored here, then committed and deployed.

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const raw = readEssayRaw(slug);
  if (raw === null) {
    return NextResponse.json({ error: "unknown_slug" }, { status: 404 });
  }
  return NextResponse.json({ slug, raw });
}

type PutBody = { raw?: string };

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev_only" }, { status: 404 });
  }

  const { slug } = await params;
  if (!earlyAccessFileExists(slug)) {
    return NextResponse.json({ error: "unknown_slug" }, { status: 404 });
  }

  let payload: PutBody;
  try {
    payload = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const raw = typeof payload.raw === "string" ? payload.raw : null;
  if (raw === null) {
    return NextResponse.json({ error: "missing_raw" }, { status: 400 });
  }

  // Never write a file that would break the live page. Re-validate
  // server-side rather than trusting the client's preview.
  const check = await checkEssaySource(raw);
  if (check.errors.length > 0) {
    return NextResponse.json(
      { error: "validation_failed", errors: check.errors },
      { status: 422 }
    );
  }

  if (!writeEssayRaw(slug, raw)) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    warnings: check.warnings,
  });
}
