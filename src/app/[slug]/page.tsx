import { getAllArticles } from "@/lib/articles";
import type { Metadata } from "next";
import { ArticleView, articleMetadata } from "./ArticleView";

// The public essay. Prerendered at build and served from the CDN, so a
// reader costs a cache hit instead of a function render (this route used
// to read cookies through the comment sheet, which made every view of
// every essay a billable server render).
//
// Nothing on this route may read cookies() or headers(): it is SSG, and
// a request-time read here 500s the page in production ("changed from
// static to dynamic at runtime"). Anything per-viewer belongs on
// /essay-live/[slug] (signed-in browsers and drafts are rewritten there)
// or in a client island.
//
// Re-rendered on the next visit after any comment write (the comment
// sheet's cache tag, see lib/public-comments.ts), and every 10 minutes
// as a backstop. Must match PUBLIC_COMMENTS_REVALIDATE_SECONDS; it has to
// be a literal here for Next to read it.
export const revalidate = 600;

type PageParams = { slug: string };

export async function generateStaticParams() {
  // Published articles only. Drafts (published: false) are intentionally
  // left out of static generation so they aren't prerendered or listed;
  // their URL is rewritten to /essay-live (next.config.ts), where the
  // gate decides who may see them.
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  return articleMetadata(slug);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  return <ArticleView slug={slug} mode="static" />;
}
