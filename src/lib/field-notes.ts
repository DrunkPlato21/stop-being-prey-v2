import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Field Notes — the spine of member-only writing on the site.
//
// Two shapes live side by side under the same `/notes/field-notes/[slug]`
// route, the same Comments integration, and the same nav surface:
//
//   1. **Journal** (new). One Field Note tied to one upcoming article.
//      Entries accrue over the course of the work; the page grows in
//      public. Frontmatter declares `article_title` and the markdown
//      body is the fixed `meta_intro`. Entries live in Redis so they
//      can be appended from the localhost admin without a redeploy.
//
//   2. **Legacy essay** (existing). Single-shot back-room essays
//      written start-to-finish. Frontmatter has `title` (no
//      `article_title`); the markdown body is the essay itself. These
//      keep rendering exactly as they always have — no URL change,
//      no comments breakage, no email-link rot.
//
// Shape detection is by frontmatter: presence of `article_title`
// flips the file into journal mode.
//
// API note: `getAllFieldNotes()` is sync and returns the static
// frontmatter-derived metadata so existing callers (comments,
// pulse, rules, nav, stripe webhook) keep working without an `await`.
// The index page wants per-note latest-entry data and uses the async
// `getAllFieldNotesWithActivity()` instead — Redis only gets touched
// when entries actually matter.

const FIELD_NOTES_DIR = path.join(process.cwd(), "content", "field-notes");

const ENTRIES_INDEX_PREFIX = "fn:entries:"; // ZSET, score=date timestamp
const ENTRY_PREFIX = "fn:entry:"; // JSON FieldNoteEntry

export type FieldNoteKind = "journal" | "legacy";

export type FieldNoteStatus =
  | "drafting"
  | "researching"
  | "in revision"
  | "shipped";

const STATUS_VALUES: FieldNoteStatus[] = [
  "drafting",
  "researching",
  "in revision",
  "shipped",
];

function coerceStatus(value: unknown): FieldNoteStatus {
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (STATUS_VALUES.includes(lower as FieldNoteStatus)) {
      return lower as FieldNoteStatus;
    }
  }
  return "drafting";
}

export type FieldNoteEntry = {
  id: string;
  slug: string;
  /** Author-provided entry date (ms since epoch). May predate or
      postdate `createdAt` — the writer might backdate a note. */
  date: number;
  title: string;
  body: string;
  createdAt: number;
};

/**
 * Static metadata returned synchronously. Old callers depended on
 * `title`, `slug`, `number`, `date`, `livePostUrl`, `screenshot`,
 * `doctrineTags`, and `excerpt` — all retained. Journal-style notes
 * fill the legacy-shaped fields with sensible defaults (number=null,
 * livePostUrl=null, etc.) and add the new journal fields below.
 */
export type FieldNoteMeta = {
  slug: string;
  kind: FieldNoteKind;
  /** Display title. For journals this is `article_title`; for legacy
      it's the essay `title`. */
  title: string;
  /** Status. Journals declare this in frontmatter (defaults to
      "drafting"). Legacy essays are always "shipped". */
  status: FieldNoteStatus;
  /** Optional human-readable timeline for in-progress journals
      (e.g. "approximately one week"). Null for legacy. */
  expectedTimeline: string | null;
  /** Defaults to true so a missing flag in legacy frontmatter
      doesn't accidentally hide a published essay. */
  public: boolean;

  /** Backwards-compat fields used by older callers. */
  number: number | null;
  date: string;
  livePostUrl: string | null;
  screenshot: string | null;
  doctrineTags: string[];
  excerpt: string;
};

/** Decorated metadata that includes Redis-derived "what's the
    latest entry" data. Returned by the async list call used by the
    index page. */
export type FieldNoteMetaWithActivity = FieldNoteMeta & {
  /** ms since epoch. Latest entry date for journals; frontmatter
      date for legacy. Used to sort the index. */
  lastActivityAt: number;
  /** Title of the most recent entry (journal only). Null for
      legacy and for journals with no entries yet. */
  latestEntryTitle: string | null;
  /** Count of entries for journal-style notes. 0 for legacy. */
  entryCount: number;
};

export type FieldNote = FieldNoteMeta & {
  /** Rendered HTML. For journals this is the `meta_intro` paragraph.
      For legacy it's the essay body. */
  contentHtml: string;
  /** Journal-style entries, newest first. Always empty for legacy. */
  entries: FieldNoteEntry[];
};

/* === Redis client (lazy singleton) ====================================== */

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isFieldNotesRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/* === Markdown layer ===================================================== */

function buildExcerpt(markdown: string, maxLen = 180): string {
  const body = markdown
    .replace(/^#.+$/gm, "")
    .replace(/`[^`]*`/g, "")
    .trim();
  const firstParagraph = body.split(/\n\s*\n/)[0] ?? "";
  const oneLine = firstParagraph.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
}

function coerceDateMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function coerceDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

type ParsedFile = {
  slug: string;
  kind: FieldNoteKind;
  data: Record<string, unknown>;
  content: string;
};

function readFile(slug: string): ParsedFile | null {
  const file = path.join(FIELD_NOTES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  const kind: FieldNoteKind =
    typeof data.article_title === "string" ? "journal" : "legacy";
  return {
    slug,
    kind,
    data: data as Record<string, unknown>,
    content,
  };
}

function metaFromFile(file: ParsedFile): FieldNoteMeta {
  if (file.kind === "journal") {
    return {
      slug: file.slug,
      kind: "journal",
      title:
        typeof file.data.article_title === "string"
          ? file.data.article_title
          : file.slug,
      status: coerceStatus(file.data.status),
      expectedTimeline:
        typeof file.data.expected_timeline === "string"
          ? file.data.expected_timeline
          : null,
      public: file.data.public !== false,
      number: null,
      date: coerceDateString(file.data.date),
      livePostUrl: null,
      screenshot: null,
      doctrineTags: [],
      excerpt: buildExcerpt(file.content),
    };
  }
  return {
    slug: file.slug,
    kind: "legacy",
    title:
      typeof file.data.title === "string" ? file.data.title : file.slug,
    status: "shipped",
    expectedTimeline: null,
    public: file.data.public !== false,
    number: typeof file.data.number === "number" ? file.data.number : null,
    date: coerceDateString(file.data.date),
    livePostUrl:
      typeof file.data.live_post_url === "string"
        ? file.data.live_post_url
        : null,
    screenshot:
      typeof file.data.screenshot === "string"
        ? file.data.screenshot
        : null,
    doctrineTags: Array.isArray(file.data.doctrine_tags)
      ? file.data.doctrine_tags.filter(
          (t: unknown): t is string => typeof t === "string"
        )
      : [],
    excerpt: buildExcerpt(file.content),
  };
}

export function getAllFieldNoteSlugs(): string[] {
  if (!fs.existsSync(FIELD_NOTES_DIR)) return [];
  return fs
    .readdirSync(FIELD_NOTES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Sync metadata listing. Kept sync so existing callers (rules,
 * comments admin, pulse, etc.) don't need to be plumbed for async.
 * Sort order: file date desc — good enough for lookup-by-slug
 * callers; the index page uses `getAllFieldNotesWithActivity()`
 * instead.
 */
export function getAllFieldNotes(): FieldNoteMeta[] {
  const slugs = getAllFieldNoteSlugs();
  const out: FieldNoteMeta[] = [];
  for (const slug of slugs) {
    const file = readFile(slug);
    if (!file) continue;
    out.push(metaFromFile(file));
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* === Redis entry layer ================================================== */

function entriesKey(slug: string): string {
  return `${ENTRIES_INDEX_PREFIX}${slug}`;
}

function entryKey(id: string): string {
  return `${ENTRY_PREFIX}${id}`;
}

function parseEntry(raw: unknown): FieldNoteEntry | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<FieldNoteEntry>)
        : (raw as Partial<FieldNoteEntry>);
    if (!parsed || typeof parsed !== "object") return null;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.slug !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      slug: parsed.slug,
      date: typeof parsed.date === "number" ? parsed.date : 0,
      title: parsed.title,
      body: parsed.body,
      createdAt:
        typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

async function listEntriesForSlug(slug: string): Promise<FieldNoteEntry[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(entriesKey(slug), 0, -1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map(entryKey);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: FieldNoteEntry[] = [];
  for (const value of raw) {
    const parsed = parseEntry(value);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => b.date - a.date);
}

export async function appendEntry(input: {
  slug: string;
  date: number;
  title: string;
  body: string;
}): Promise<
  | { ok: true; entry: FieldNoteEntry }
  | { ok: false; error: "storage_unavailable" | "unknown_slug" | "invalid_input" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const file = readFile(input.slug);
  if (!file) return { ok: false, error: "unknown_slug" };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "invalid_input" };

  const id = randomUUID();
  const now = Date.now();
  const entry: FieldNoteEntry = {
    id,
    slug: input.slug,
    date: input.date,
    title,
    body,
    createdAt: now,
  };

  await client.set(entryKey(id), JSON.stringify(entry));
  await client.zadd(entriesKey(input.slug), {
    score: input.date,
    member: id,
  });
  return { ok: true, entry };
}

export async function deleteEntry(
  slug: string,
  entryId: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  await client.del(entryKey(entryId));
  await client.zrem(entriesKey(slug), entryId);
  return true;
}

export async function listEntries(slug: string): Promise<FieldNoteEntry[]> {
  return listEntriesForSlug(slug);
}

/* === Unified read API =================================================== */

/**
 * Async listing with Redis-derived activity decoration. Used by
 * the index page so it can sort by latest-entry date and preview
 * the most recent entry title beneath each note.
 */
export async function getAllFieldNotesWithActivity(): Promise<
  FieldNoteMetaWithActivity[]
> {
  const base = getAllFieldNotes();
  const out: FieldNoteMetaWithActivity[] = [];
  for (const meta of base) {
    if (meta.kind === "journal") {
      const entries = await listEntriesForSlug(meta.slug);
      const latest = entries[0] ?? null;
      const lastActivityAt = latest?.date ?? coerceDateMs(meta.date);
      out.push({
        ...meta,
        lastActivityAt,
        latestEntryTitle: latest?.title ?? null,
        entryCount: entries.length,
        // For journals we'd rather preview the latest entry's body
        // than a slice of the meta_intro. Falls back to meta.excerpt
        // when there are no entries.
        excerpt: latest ? buildExcerpt(latest.body) : meta.excerpt,
      });
    } else {
      out.push({
        ...meta,
        lastActivityAt: coerceDateMs(meta.date),
        latestEntryTitle: null,
        entryCount: 0,
      });
    }
  }
  return out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export async function getFieldNoteBySlug(
  slug: string
): Promise<FieldNote | null> {
  const file = readFile(slug);
  if (!file) return null;
  const meta = metaFromFile(file);
  const processed = await remark().use(html).process(file.content);
  const contentHtml = processed.toString();
  const entries =
    file.kind === "journal" ? await listEntriesForSlug(slug) : [];
  return {
    ...meta,
    contentHtml,
    entries,
  };
}

/** Render a markdown string to HTML using the site's remark config.
    Exposed so the detail page can render each entry body with the
    same prose pipeline used for note content. */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const processed = await remark().use(html).process(markdown);
  return processed.toString();
}
