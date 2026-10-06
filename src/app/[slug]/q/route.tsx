import { getArticleBySlug } from "@/lib/articles";
import { findQuoteInArticle } from "@/lib/quote-cards";
import { generateQuoteCard, type QuoteCardFormat } from "@/lib/og-image";

// GET /<essay-slug>/q?t=<highlighted line>[&f=portrait]
//
// The quote card behind the essay page's highlight-to-share bar. Renders
// a PNG of the line on brand paper. `t` must be text that is actually in
// the essay (findQuoteInArticle), so the route can't be used to put
// arbitrary words in Clay's mouth on his own letterhead. The card sets
// the essay's own slice of text, not the caller's string.
//
// Drafts (published: false) are refused outright: their body is
// members-only, and a card would be a way to read it out line by line.

// Same input -> same PNG, so let the CDN keep it. A reader who shares a
// card and twenty people open it costs one render, not twenty. A month
// is fine: if Clay edits a line out of an essay, a card that already
// went out is already out.
const CACHE_HIT = "public, max-age=86400, s-maxage=2592000";
const CACHE_MISS = "public, max-age=300, s-maxage=3600";

function refuse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE_MISS,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";
  const format: QuoteCardFormat =
    url.searchParams.get("f") === "portrait" ? "portrait" : "landscape";

  // Cheap rejection before reading anything off disk.
  if (!t || t.length > 640) return refuse(400, "Bad quote.");

  const article = await getArticleBySlug(slug);
  if (!article || article.published === false) {
    return refuse(404, "Not found.");
  }

  const quote = findQuoteInArticle(article.contentHtml, t);
  if (!quote) return refuse(404, "That line isn't in this essay.");

  const image = await generateQuoteCard({
    quote,
    title: article.title,
    format,
  });
  image.headers.set("Cache-Control", CACHE_HIT);
  return image;
}
