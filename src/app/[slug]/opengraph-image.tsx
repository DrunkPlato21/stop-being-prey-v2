import { generateArticleOG, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";
import { getArticleBySlug } from "@/lib/articles";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt =
  "Stop Being Prey. On power, politics, and the apex class.";

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  return [
    {
      id: "default",
      alt:
        article?.description ??
        "Stop Being Prey. On power, politics, and the apex class.",
      contentType: OG_CONTENT_TYPE,
      size: OG_SIZE,
    },
  ];
}

export default async function ArticleOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return generateArticleOG(slug);
}
