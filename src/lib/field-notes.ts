import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

// Field Notes content pipeline. Mirrors the article pipeline pattern
// but with its own frontmatter: number, doctrine_tags, screenshot,
// live_post_url. Files live in content/field-notes/.

const FIELD_NOTES_DIR = path.join(process.cwd(), "content", "field-notes");

export type FieldNoteMeta = {
  slug: string;
  title: string;
  number: number;
  date: string;
  livePostUrl: string | null;
  screenshot: string | null;
  doctrineTags: string[];
  excerpt: string;
};

export type FieldNote = FieldNoteMeta & {
  contentHtml: string;
};

export function getAllFieldNoteSlugs(): string[] {
  if (!fs.existsSync(FIELD_NOTES_DIR)) return [];
  return fs
    .readdirSync(FIELD_NOTES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

function buildExcerpt(markdown: string, maxLen = 180): string {
  // Strip headings + obvious markdown markers, take first paragraph.
  const body = markdown
    .replace(/^#.+$/gm, "")
    .replace(/`[^`]*`/g, "")
    .trim();
  const firstParagraph = body.split(/\n\s*\n/)[0] ?? "";
  const oneLine = firstParagraph.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

function coerceDate(value: unknown): string {
  // gray-matter parses ISO YAML dates into Date objects; we store them
  // as ISO strings so callers can format with toLocaleDateString.
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function readMeta(slug: string): FieldNoteMeta | null {
  const file = path.join(FIELD_NOTES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  if (typeof data.title !== "string") return null;
  return {
    slug: typeof data.slug === "string" ? data.slug : slug,
    title: data.title,
    number: typeof data.number === "number" ? data.number : 0,
    date: coerceDate(data.date),
    livePostUrl:
      typeof data.live_post_url === "string" ? data.live_post_url : null,
    screenshot:
      typeof data.screenshot === "string" ? data.screenshot : null,
    doctrineTags: Array.isArray(data.doctrine_tags)
      ? data.doctrine_tags.filter((t: unknown): t is string => typeof t === "string")
      : [],
    excerpt: buildExcerpt(content),
  };
}

/**
 * Return all Field Notes sorted newest-first by `number` (then by date
 * as a tiebreaker).
 */
export function getAllFieldNotes(): FieldNoteMeta[] {
  const slugs = getAllFieldNoteSlugs();
  const notes: FieldNoteMeta[] = [];
  for (const slug of slugs) {
    const meta = readMeta(slug);
    if (meta) notes.push(meta);
  }
  return notes.sort((a, b) => {
    if (b.number !== a.number) return b.number - a.number;
    return a.date < b.date ? 1 : -1;
  });
}

export async function getFieldNoteBySlug(
  slug: string
): Promise<FieldNote | null> {
  const meta = readMeta(slug);
  if (!meta) return null;
  const file = path.join(FIELD_NOTES_DIR, `${slug}.md`);
  const raw = fs.readFileSync(file, "utf8");
  const { content } = matter(raw);
  const processed = await remark().use(html).process(content);
  return {
    ...meta,
    contentHtml: processed.toString(),
  };
}
