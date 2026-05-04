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
  spotifyEpisodeId?: string;
  chapter?: number;
  wordCount?: number;
};

export type Article = ArticleMeta & {
  contentHtml: string;
};

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
  const contentHtml = processedContent.toString();

  return {
    title: data.title,
    slug: data.slug || slug,
    date: data.date,
    description: data.description,
    spotifyEpisodeId: data.spotifyEpisodeId,
    chapter: data.chapter,
    wordCount: data.wordCount,
    contentHtml,
  };
}
