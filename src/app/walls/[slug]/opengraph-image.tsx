import { generatePredatorWallOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A Predator Wall on Stop Being Prey.";

export default async function PredatorWallOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return generatePredatorWallOG(slug);
}
