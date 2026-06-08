import { getAllArticles } from "@/lib/articles";

// RSS 2.0 feed at /feed.xml, built from the published essays. A route
// handler (not a page), so it's independent of the layout's auth and can
// be cached. Summary-only items that link back to the site — discovery +
// syndication, and it drives clicks to the essays rather than replacing
// them.

const SITE = "https://stopbeingprey.com";

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const articles = getAllArticles(); // published, newest first
  const lastBuild = articles[0]?.date
    ? new Date(articles[0].date).toUTCString()
    : new Date(0).toUTCString();

  const items = articles
    .map((a) => {
      const url = `${SITE}/${a.slug}`;
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(a.date).toUTCString()}</pubDate>
      <description>${escapeXml(a.description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Stop Being Prey</title>
    <link>${SITE}</link>
    <description>Original writing on power, politics, and the apex class.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
