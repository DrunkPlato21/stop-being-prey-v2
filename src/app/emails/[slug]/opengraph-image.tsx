import { generateEmailOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";
import { getEmailBySlug } from "@/lib/email-archive";

// Share card for an archive email, so a gift link looks right when it's
// texted or posted. Subject and preview only, both already public on the
// email's teaser page.

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "An email from Clay, Stop Being Prey.";

export default async function EmailOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await getEmailBySlug(slug);
  return generateEmailOG(
    found?.email.subject ?? "Every email",
    found?.email.preview ?? "From Clay, at Stop Being Prey."
  );
}
