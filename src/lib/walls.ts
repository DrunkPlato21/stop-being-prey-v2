import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

const wallsDirectory = path.join(process.cwd(), "content", "walls");

export type WallStatus = "active" | "closed";

export type WallMeta = {
  slug: string;
  title: string;
  intro: string;
  status: WallStatus;
  /** ISO date when the founding-window prize period ends. After this,
      the top donor is identified manually for the v1 prize fulfillment. */
  foundingWindowEndsAt?: string;
};

export type Wall = WallMeta & {
  takedownHtml: string;
};

export function getAllWallSlugs(): string[] {
  if (!fs.existsSync(wallsDirectory)) return [];
  return fs
    .readdirSync(wallsDirectory)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function parseMeta(slug: string, data: Record<string, unknown>): WallMeta {
  const status =
    data.status === "closed" ? "closed" : "active";
  return {
    slug: typeof data.slug === "string" ? data.slug : slug,
    title: typeof data.title === "string" ? data.title : slug,
    intro: typeof data.intro === "string" ? data.intro : "",
    status,
    foundingWindowEndsAt:
      typeof data.founding_window_ends_at === "string"
        ? data.founding_window_ends_at
        : undefined,
  };
}

export function getAllWalls(): WallMeta[] {
  return getAllWallSlugs().map((slug) => {
    const fullPath = path.join(wallsDirectory, `${slug}.md`);
    const { data } = matter(fs.readFileSync(fullPath, "utf8"));
    return parseMeta(slug, data);
  });
}

export async function getWallBySlug(slug: string): Promise<Wall | null> {
  const fullPath = path.join(wallsDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const { data, content } = matter(fs.readFileSync(fullPath, "utf8"));
  const processed = await remark().use(html).process(content);

  return {
    ...parseMeta(slug, data),
    takedownHtml: processed.toString(),
  };
}
