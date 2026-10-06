import { generateCaseFileOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";
import { getCaseFileBySlug } from "@/lib/case-files";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt = "Case Files. Stop Being Prey.";

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cf = getCaseFileBySlug(slug);
  return [
    {
      id: "default",
      alt: cf ? `${cf.title}. Case Files. Stop Being Prey.` : alt,
      contentType: OG_CONTENT_TYPE,
      size: OG_SIZE,
    },
  ];
}

export default async function CaseFileOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return generateCaseFileOG(slug);
}
