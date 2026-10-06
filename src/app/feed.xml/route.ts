import { getAllArticles, getArticleBySlug } from "@/lib/articles";

// RSS 2.0 feed at /feed.xml, built from the published essays. A route
// handler (not a page), so it's independent of the layout's auth and can
// be cached. Full text since 2026-10: each item carries the whole essay
// in content:encoded, so feed readers and aggregators show the piece
// itself, with <description> kept as the one-line summary for readers
// that only show that. Every item ends with a link back to the piece,
// where the comments and the patronage ask live.

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

// Feed readers resolve nothing relative: site-root links and images in
// the essay body become absolute. The inline {{CTA}} marker is a page
// placement hint (the subscribe form goes there) and means nothing here.
function feedHtml(html: string): string {
  return html
    .replace(/<p>\s*\{\{\s*CTA\s*\}\}\s*<\/p>/gi, "")
    .replace(/(src|href)="\/(?!\/)/g, `$1="${SITE}/`);
}

// CDATA can hold anything except its own terminator.
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET() {
  const articles = getAllArticles(); // published, newest first
  const lastBuild = articles[0]?.date
    ? new Date(articles[0].date).toUTCString()
    : new Date(0).toUTCString();

  const full = await Promise.all(articles.map((a) => getArticleBySlug(a.slug)));

  const items = articles
    .map((a, i) => {
      const url = `${SITE}/${a.slug}`;
      const body = full[i];
      const html = body
        ? feedHtml(body.contentHtml) +
          (body.referencesHtml
            ? `<h2>References</h2>${feedHtml(body.referencesHtml)}`
            : "") +
          `<hr /><p><a href="${url}">Read this on Stop Being Prey</a></p>`
        : null;
      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(a.date).toUTCString()}</pubDate>
      <dc:creator>Clay</dc:creator>
      <description>${escapeXml(a.description)}</description>${
        html ? `\n      <content:encoded>${cdata(html)}</content:encoded>` : ""
      }
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Stop Being Prey</title>
    <link>${SITE}</link>
    <description>Original writing on power, politics, and the apex class.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE}/icon.png</url>
      <title>Stop Being Prey</title>
      <link>${SITE}</link>
    </image>
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
