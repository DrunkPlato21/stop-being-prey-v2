import type { Metadata } from "next";
import { ArticleView, articleMetadata } from "@/app/[slug]/ArticleView";

// The per-request copy of an essay. Nobody links here: proxy.ts rewrites
// a signed-in browser's /<slug> to this route, and next.config.ts
// rewrites every draft's /<slug> here for everyone, so the address bar
// keeps the real URL. It renders with the session, which is what the
// member's comment sheet (form, coins, their held comments) and the
// draft gate need. Signed-out readers of a published essay never get
// here; they read the prerendered /[slug].
//
// Hit directly, it just renders the essay for whoever is asking, the
// same as /<slug> would. The canonical points at /<slug>.
export const dynamic = "force-dynamic";

type PageParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const base = await articleMetadata(slug);
  // The share cards are file conventions under /[slug], so Next only
  // attaches them to that route. Point at them explicitly, or a draft
  // link pasted into a chat would unfurl without its card.
  return {
    ...base,
    ...(base.openGraph
      ? {
          openGraph: {
            ...base.openGraph,
            images: [`/${slug}/opengraph-image/default`],
          },
        }
      : {}),
    ...(base.twitter
      ? {
          twitter: {
            ...base.twitter,
            images: [`/${slug}/twitter-image/default`],
          },
        }
      : {}),
  };
}

export default async function LiveArticlePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  return <ArticleView slug={slug} mode="request" />;
}
