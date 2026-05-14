import { redirect } from "next/navigation";

// Legacy route. Field notes moved to /notes/field-notes/[slug] when DEN
// became the /notes landing. Permanent redirect preserves any old links
// that were shared before the restructure.
//
// This file MUST stay a single-segment dynamic route ([slug]) so it
// only catches /notes/<something>. /notes/field-notes/* and other
// static sibling routes take precedence in Next's matcher.

export default async function LegacyFieldNotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/notes/field-notes/${slug}`);
}
