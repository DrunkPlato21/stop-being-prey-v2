import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const articlesDirectory = path.join(process.cwd(), "content", "articles");

export type ArticleMeta = {
  title: string;
  slug: string;
  date: string;
  description: string;
  subtitle?: string;
  issue?: number;
  spotifyEpisodeId?: string;
  chapter?: number;
  wordCount?: number;
};

export type Article = ArticleMeta & {
  contentHtml: string;
  /** Optional citation block, populated when the markdown ends with a
      `## References` heading followed by a list. The body is stripped of
      both the heading and the list so it renders cleanly. */
  referencesHtml?: string | null;
};

/**
 * Split rendered article HTML on a trailing `## References` heading.
 * Returns the body (everything before the heading) and the references list
 * (everything after, expected to be a single <ul> or <ol>). When no such
 * heading exists, body is the input unchanged and references is null.
 */
function splitReferences(fullHtml: string): {
  contentHtml: string;
  referencesHtml: string | null;
} {
  const match = fullHtml.match(
    /<h2[^>]*>\s*References\s*<\/h2>([\s\S]+)$/i
  );
  if (!match || match.index === undefined) {
    return { contentHtml: fullHtml, referencesHtml: null };
  }
  return {
    contentHtml: fullHtml.slice(0, match.index).trimEnd(),
    referencesHtml: match[1].trim(),
  };
}

export function getAllArticleSlugs(): string[] {
  if (!fs.existsSync(articlesDirectory)) return [];
  return fs
    .readdirSync(articlesDirectory)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getAllArticles(): ArticleMeta[] {
  const slugs = getAllArticleSlugs();
  const articles = slugs.map((slug) => {
    const fullPath = path.join(articlesDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data } = matter(fileContents);
    return {
      title: data.title,
      slug: data.slug || slug,
      date: data.date,
      description: data.description,
      subtitle: data.subtitle,
      issue: data.issue,
      spotifyEpisodeId: data.spotifyEpisodeId,
      chapter: data.chapter,
      wordCount: data.wordCount,
    } as ArticleMeta;
  });
  return articles.sort((a, b) =>
    a.date < b.date ? 1 : -1
  );
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const fullPath = path.join(articlesDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const processedContent = await remark().use(html).process(content);
  const fullHtml = processedContent.toString();
  const { contentHtml, referencesHtml } = splitReferences(fullHtml);

  return {
    title: data.title,
    slug: data.slug || slug,
    date: data.date,
    description: data.description,
    subtitle: data.subtitle,
    issue: data.issue,
    spotifyEpisodeId: data.spotifyEpisodeId,
    chapter: data.chapter,
    wordCount: data.wordCount,
    contentHtml,
    referencesHtml,
  };
}
