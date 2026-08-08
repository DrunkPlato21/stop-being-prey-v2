import { assembleDigest } from "@/lib/digest";
import { signDigestToken } from "@/lib/auth";
import { baseUrl } from "@/lib/membership";
import { sendWeeklyDigestEmail } from "@/lib/email";

// "Send me a test" for the weekly digest: assembles the real payload
// (chamber included, NOT consumed) and mails it to ADMIN_EMAIL only.
// Lets Clay read exactly what Sunday's send will look like from his
// own inbox before it ever reaches a member. Gated by proxy.ts Basic
// auth on /api/admin/*.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return Response.json({ error: "admin_email_not_configured" }, { status: 500 });
  }

  const payload = await assembleDigest();
  const site = baseUrl();
  const token = await signDigestToken(adminEmail);

  const sent = await sendWeeklyDigestEmail({
    to: adminEmail,
    payload,
    siteUrl: site,
    unsubPageUrl: `${site}/digest/unsubscribe?token=${encodeURIComponent(token)}`,
    unsubPostUrl: `${site}/api/digest/unsubscribe?token=${encodeURIComponent(token)}`,
  });

  if (!sent.ok) {
    return Response.json({ error: sent.error }, { status: 502 });
  }
  return Response.json({ ok: true, to: adminEmail });
}
