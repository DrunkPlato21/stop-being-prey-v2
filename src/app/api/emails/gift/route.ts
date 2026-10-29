import { getArchiveReader, getEmailMetaByKitId } from "@/lib/email-archive";
import { createGift } from "@/lib/email-gifts";

// POST /api/emails/gift  { kitId }
//   -> { url, reused, remaining }        a link that opens this one email
//   -> 429 { error: "limit", remaining: 0 }  over this month's cap
//
// Patrons only. Sharing an email they've shared before hands back the
// same link and doesn't count against the month.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const reader = await getArchiveReader(url.searchParams.get("dev_preview"));
  if (!reader) {
    return Response.json({ error: "patrons only" }, { status: 403 });
  }
  let body: { kitId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const kitId = Number(body.kitId);
  const email = Number.isSafeInteger(kitId)
    ? await getEmailMetaByKitId(kitId)
    : null;
  // Essays are public pages already; there's nothing to gift.
  if (!email || email.essay) {
    return Response.json({ error: "not_giftable" }, { status: 400 });
  }

  const result = await createGift(reader.email, kitId);
  if (!result.ok) {
    return Response.json(
      { error: result.error, remaining: result.remaining },
      { status: result.error === "limit" ? 429 : 503 }
    );
  }
  return Response.json({
    url: `${url.origin}/emails/${email.slug}?g=${result.token}`,
    reused: result.reused,
    remaining: result.remaining,
  });
}
