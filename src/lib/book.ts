import { Redis } from "@upstash/redis";

// Single-record book metadata. There's only one book (Stop Being
// Prey), so this lives under a fixed key and the lib exposes get/
// save rather than the usual list/CRUD shape.
//
// Optional sections (excerpt, chapters, preorderUrl) are nullable so
// the landing page can decide at render time whether to surface
// them. Clay populates them via /admin/book as the book matures.
//
// Redis schema:
//   book:meta   JSON BookMeta (single key)

const KEY = "book:meta";

export type BookStatus =
  | "in_development"
  | "first_draft"
  | "editing"
  | "production"
  | "ready_for_release"
  | "released";

export const BOOK_STATUSES: BookStatus[] = [
  "in_development",
  "first_draft",
  "editing",
  "production",
  "ready_for_release",
  "released",
];

export type ChapterEntry = {
  title: string;
  status: string;
};

export type BookMeta = {
  title: string;
  subtitle: string;
  status: BookStatus;
  description: string;
  coverUrl: string | null;
  /** Optional sample chapter or excerpt body. Markdown ok. */
  excerpt: string | null;
  /** Optional chapter list. Each entry has a title + free-form status. */
  chapters: ChapterEntry[] | null;
  /** Optional outbound preorder URL. Renders a CTA when set. */
  preorderUrl: string | null;
  updatedAt: number;
};

export const DEFAULT_BOOK: BookMeta = {
  title: "Stop Being Prey",
  subtitle: "",
  status: "in_development",
  description: "",
  coverUrl: null,
  excerpt: null,
  chapters: null,
  preorderUrl: null,
  updatedAt: 0,
};

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

export function isBookConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function statusLabel(status: BookStatus): string {
  switch (status) {
    case "in_development":
      return "In development";
    case "first_draft":
      return "First draft in progress";
    case "editing":
      return "Editing";
    case "production":
      return "In production";
    case "ready_for_release":
      return "Ready for release";
    case "released":
      return "Released";
  }
}

function isBookStatus(value: unknown): value is BookStatus {
  return (
    typeof value === "string" &&
    (BOOK_STATUSES as readonly string[]).includes(value)
  );
}

function parseMeta(raw: unknown): BookMeta {
  if (raw === null || raw === undefined) return { ...DEFAULT_BOOK };
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<BookMeta>)
        : (raw as Partial<BookMeta>);
    return {
      title: typeof parsed.title === "string" ? parsed.title : DEFAULT_BOOK.title,
      subtitle:
        typeof parsed.subtitle === "string"
          ? parsed.subtitle
          : DEFAULT_BOOK.subtitle,
      status: isBookStatus(parsed.status) ? parsed.status : DEFAULT_BOOK.status,
      description:
        typeof parsed.description === "string"
          ? parsed.description
          : DEFAULT_BOOK.description,
      coverUrl:
        typeof parsed.coverUrl === "string" && parsed.coverUrl.length > 0
          ? parsed.coverUrl
          : null,
      excerpt:
        typeof parsed.excerpt === "string" && parsed.excerpt.trim().length > 0
          ? parsed.excerpt
          : null,
      chapters: Array.isArray(parsed.chapters)
        ? parsed.chapters
            .filter(
              (c): c is ChapterEntry =>
                typeof c === "object" &&
                c !== null &&
                typeof (c as ChapterEntry).title === "string" &&
                typeof (c as ChapterEntry).status === "string"
            )
            .slice(0, 64)
        : null,
      preorderUrl:
        typeof parsed.preorderUrl === "string" &&
        parsed.preorderUrl.trim().length > 0
          ? parsed.preorderUrl
          : null,
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return { ...DEFAULT_BOOK };
  }
}

export async function getBook(): Promise<BookMeta> {
  const client = getClient();
  if (!client) return { ...DEFAULT_BOOK };
  const raw = await client.get<string>(KEY).catch(() => null);
  return parseMeta(raw);
}

const MAX_TITLE = 120;
const MAX_SUBTITLE = 200;
const MAX_DESCRIPTION = 12_000;
const MAX_EXCERPT = 20_000;
const MAX_URL = 500;

function sanitizeLine(input: string, cap: number): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
}

function sanitizeBlock(input: string, cap: number): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, cap);
}

export type SaveInput = Partial<{
  title: string;
  subtitle: string;
  status: BookStatus;
  description: string;
  coverUrl: string | null;
  excerpt: string | null;
  chapters: ChapterEntry[] | null;
  preorderUrl: string | null;
}>;

/**
 * Partial-merge save. Any field omitted from `input` keeps its prior
 * value. Use `coverUrl: null` to clear the cover, same for excerpt /
 * chapters / preorderUrl.
 */
export async function saveBook(input: SaveInput): Promise<BookMeta> {
  const current = await getBook();
  const next: BookMeta = {
    title:
      typeof input.title === "string"
        ? sanitizeLine(input.title, MAX_TITLE) || current.title
        : current.title,
    subtitle:
      typeof input.subtitle === "string"
        ? sanitizeLine(input.subtitle, MAX_SUBTITLE)
        : current.subtitle,
    status: isBookStatus(input.status) ? input.status : current.status,
    description:
      typeof input.description === "string"
        ? sanitizeBlock(input.description, MAX_DESCRIPTION)
        : current.description,
    coverUrl:
      input.coverUrl === null
        ? null
        : typeof input.coverUrl === "string" && input.coverUrl.length > 0
          ? input.coverUrl.slice(0, MAX_URL)
          : current.coverUrl,
    excerpt:
      input.excerpt === null
        ? null
        : typeof input.excerpt === "string"
          ? sanitizeBlock(input.excerpt, MAX_EXCERPT) || null
          : current.excerpt,
    chapters:
      input.chapters === null
        ? null
        : Array.isArray(input.chapters)
          ? input.chapters
              .map((c) => ({
                title: sanitizeLine(c.title ?? "", 200),
                status: sanitizeLine(c.status ?? "", 80),
              }))
              .filter((c) => c.title.length > 0)
              .slice(0, 64)
          : current.chapters,
    preorderUrl:
      input.preorderUrl === null
        ? null
        : typeof input.preorderUrl === "string" &&
            input.preorderUrl.trim().length > 0
          ? input.preorderUrl.trim().slice(0, MAX_URL)
          : current.preorderUrl,
    updatedAt: Date.now(),
  };
  const client = getClient();
  if (client) {
    await client.set(KEY, JSON.stringify(next));
  }
  return next;
}
