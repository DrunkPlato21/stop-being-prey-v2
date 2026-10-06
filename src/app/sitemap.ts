import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";

// Public sitemap. Lists the homepage, every published essay (getAllArticles
// already drops drafts), and the key public marketing pages. Member-gated
// surfaces (/desk, /lounge, /notifications, /case-files) and transactional
// utility pages are intentionally excluded — they're disallowed in robots
// and shouldn't be indexed.

const BASE = "https://stopbeingprey.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getAllArticles(); // published, newest first
  const newest = articles[0]?.date ? new Date(articles[0].date) : new Date();

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE}/${a.slug}`,
    lastModified: new Date(a.date),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: newest, changeFrequency: "weekly", priority: 1 },
    // The doctrine front door — public lure, key conversion + SEO surface.
    { url: `${BASE}/rules`, lastModified: newest, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/writing`, lastModified: newest, changeFrequency: "weekly", priority: 0.7 },
    // The patronage page. Canonical of the three URLs that render it, so
    // it is the one that has to be indexable and listed here.
    { url: `${BASE}/patronage`, changeFrequency: "monthly", priority: 0.7 },
    // /membership and /support-donate render the same page and canonical
    // to /patronage. A sitemap entry whose canonical points elsewhere is a
    // mixed signal Google reports as an error, so only /patronage is
    // listed; the canonical tag carries /membership's inbound links over.
    { url: `${BASE}/wall`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/join`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/supporters`, changeFrequency: "weekly", priority: 0.4 },
  ];

  return [...staticPages, ...articleEntries];
}
