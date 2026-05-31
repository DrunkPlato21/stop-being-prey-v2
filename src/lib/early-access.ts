import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

// Early-access essays — member-only "read it first" drops that live as
// markdown files under content/early-access and render at their own
// route (e.g. /the-massie-problem). The markdown file is the source of
// truth; the page reads it off disk at request time.
//
// This module is the single home for:
//   1. The render pipeline (remark + the {{PULL}}/{{FIGURE}}/{{IMAGE}}
//      and blockquote token transforms). The live route AND the
//      localhost authoring editor both call renderEssayBody(), so the
//      editor's live preview is guaranteed to match production exactly
//      — same code, no drift.
//   2. Reading / writing / validating the raw file, used by the
//      localhost-only editor under /admin/early-access.
//
// Writing only ever happens on the dev server: the editor and its API
// are under /admin and /api/admin, which proxy.ts 404s in production.
// On the live (Vercel) host the filesystem is read-only anyway, so the
// file is only ever authored locally, then committed and deployed.

const EARLY_ACCESS_DIR = path.join(process.cwd(), "content", "early-access");

const DEFAULT_TITLE = "The Thomas Massie Problem";

/** Slugs are filenames; keep them to a safe charset so a slug can never
    escape the early-access directory via traversal. */
function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

function sourcePath(slug: string): string {
  return path.join(EARLY_ACCESS_DIR, `${slug}.md`);
}

export function earlyAccessFileExists(slug: string): boolean {
  return isSafeSlug(slug) && fs.existsSync(sourcePath(slug));
}

export function listEarlyAccessSlugs(): string[] {
  if (!fs.existsSync(EARLY_ACCESS_DIR)) return [];
  return fs
    .readdirSync(EARLY_ACCESS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .filter(isSafeSlug)
    .sort();
}

/** Raw file contents (frontmatter + body) for the editor to load. */
export function readEssayRaw(slug: string): string | null {
  if (!earlyAccessFileExists(slug)) return null;
  return fs.readFileSync(sourcePath(slug), "utf8");
}

/** Overwrite the file on disk. Caller is responsible for the dev-only
    guard and for validating first; this just writes. Returns false if
    the slug is unsafe or the file doesn't already exist (we only ever
    edit existing essays here, never create new files blind). */
export function writeEssayRaw(slug: string, raw: string): boolean {
  if (!earlyAccessFileExists(slug)) return false;
  fs.writeFileSync(sourcePath(slug), raw, "utf8");
  return true;
}

/* === Render pipeline ==================================================== */

/**
 * Turn an essay body (markdown WITHOUT frontmatter) into the final HTML
 * string, including all the custom token treatments. This is the
 * verbatim logic that used to live inline in the route's loadEssay();
 * both the route and the editor preview now share it.
 */
export async function renderEssayBody(content: string): Promise<string> {
  const processed = await remark().use(html).process(content);
  let bodyHtml = processed.toString();

  // {{FIGURE: src | alt | caption}} -> captioned figure (olive border +
  // paper bg + italic caption). Width-capped to the column.
  bodyHtml = bodyHtml.replace(
    /<p>\s*\{\{FIGURE:\s*([\s\S]*?)\}\}\s*<\/p>/g,
    (_m, inner: string) => {
      const [src, alt, caption] = inner.split("|").map((s) => s.trim());
      const fig =
        `<img src="${src}" alt="${alt ?? ""}" loading="lazy" ` +
        `style="display:block;width:100%;height:auto;` +
        `border:1px solid var(--eye-deep);background:var(--paper);" />`;
      const cap = caption
        ? `<figcaption style="margin-top:0.6rem;text-align:center;` +
          `font-style:italic;color:var(--ink-muted);font-size:0.92rem;">` +
          `${caption}</figcaption>`
        : "";
      return `<figure style="margin:2.75rem 0;">${fig}${cap}</figure>`;
    }
  );

  // {{IMAGE: caption}} -> a clearly-styled "image to add" placeholder.
  bodyHtml = bodyHtml.replace(
    /<p>\s*\{\{IMAGE:\s*([\s\S]*?)\}\}\s*<\/p>/g,
    (_m, caption: string) =>
      `<aside role="note" style="margin:2.75rem 0;padding:0.9rem 1.2rem;` +
      `border:1px dashed var(--eye-deep);background:var(--paper-deep);` +
      `font-family:var(--font-display),sans-serif;font-size:0.72rem;` +
      `letter-spacing:0.18em;text-transform:uppercase;font-weight:600;` +
      `color:var(--eye-deep);">Image to add &middot; ${caption.trim()}</aside>`
  );

  // {{PULL: text | attribution}} -> centered kill-shot pull quote
  // (attribution optional; " // " forces a manual line break).
  bodyHtml = bodyHtml.replace(
    /<p>\s*\{\{PULL:\s*([\s\S]*?)\}\}\s*<\/p>/g,
    (_m, inner: string) => {
      const [quote, attr] = inner.split("|").map((s) => s.trim());
      const quoteHtml = (quote ?? "").replace(/\s*\/\/\s*/g, "<br>");
      const cap = attr ? `<figcaption>${attr}</figcaption>` : "";
      return `<figure class="ea-pullquote"><p>${quoteHtml}</p>${cap}</figure>`;
    }
  );

  // Every remaining <blockquote> becomes a sourced-receipt block quote,
  // lifting a trailing "~ …" attribution paragraph OUT into a figcaption.
  bodyHtml = bodyHtml.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/g,
    (_m, body: string) => {
      const paras = body.match(/<p>[\s\S]*?<\/p>/g) ?? [];
      let quoteInner = body;
      let attr = "";
      if (paras.length > 0) {
        const last = paras[paras.length - 1];
        const lastText = last.replace(/<[^>]+>/g, "").trim();
        if (/^~/.test(lastText)) {
          // Keep the attribution paragraph's INNER HTML so a markdown
          // source link survives as a real <a> in the citation. Only
          // strip the wrapping <p> and the leading "~ " marker. (Tag-
          // stripping the whole line here is what used to delete the
          // attribution hyperlinks.)
          attr = last
            .replace(/^\s*<p>/, "")
            .replace(/<\/p>\s*$/, "")
            .replace(/^\s*~\s*/, "")
            .trim();
          quoteInner = body.slice(0, body.lastIndexOf(last)).trimEnd();
        }
      }
      // Short, unattributed one-liner -> light treatment (no panel).
      if (!attr) {
        const remaining = quoteInner.match(/<p>[\s\S]*?<\/p>/g) ?? [];
        const plain = quoteInner
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (remaining.length <= 1 && plain.length <= 90) {
          return `<figure class="ea-quote-light"><blockquote>${quoteInner}</blockquote></figure>`;
        }
      }
      // Strip the quote's own surrounding double quotes so the
      // decorative oversized glyph is the only opening quote mark.
      const stripped = quoteInner
        .replace(/^(\s*<p>\s*(?:<em>\s*)?)["“]/, "$1")
        .replace(/["”](\s*(?:<\/em>\s*)?<\/p>\s*)$/, "$1");
      const attrFormatted = attr.replace(/,\s+(?!\d{4}\b)/g, " • ");
      const cap = attr
        ? `<figcaption>${attrFormatted}</figcaption>`
        : "";
      return `<figure class="ea-blockquote"><blockquote>${stripped}</blockquote>${cap}</figure>`;
    }
  );

  return bodyHtml;
}

/** Format a frontmatter date value into the dateline string the page
    shows. Empty string when absent/unparseable. */
export function formatEssayDate(value: unknown): string {
  const date = typeof value === "string" ? value : "";
  if (!date) return "";
  const t = Date.parse(date);
  if (Number.isNaN(t)) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function essayTitle(data: Record<string, unknown>): string {
  return typeof data.title === "string" && data.title.trim()
    ? data.title
    : DEFAULT_TITLE;
}

export type LoadedEssay = {
  title: string;
  dateStr: string;
  bodyHtml: string;
  wordCount: number;
};

/** Word count from the raw markdown body. Strips the custom {{...}}
    tokens and markdown link URLs so the count reflects prose the reader
    actually reads, matching how article wordCount is presented. */
export function countWords(content: string): number {
  const text = content
    .replace(/\{\{[\s\S]*?\}\}/g, " ") // PULL/FIGURE/IMAGE tokens
    .replace(/\]\([^)]*\)/g, "]") // markdown link URLs, keep link text
    .replace(/[#>*_`~\\[\]]/g, " ") // markdown punctuation
    .trim();
  const words = text.match(/\S+/g);
  return words ? words.length : 0;
}

/** Parse + render a full essay file (frontmatter + body) from disk.
    Used by the live route. Throws if the file is missing. */
export async function loadEssay(slug: string): Promise<LoadedEssay> {
  const raw = readEssayRaw(slug);
  if (raw === null) {
    throw new Error(`Early-access essay not found: ${slug}`);
  }
  const { data, content } = matter(raw);
  const bodyHtml = await renderEssayBody(content);
  return {
    title: essayTitle(data as Record<string, unknown>),
    dateStr: formatEssayDate((data as Record<string, unknown>).date),
    bodyHtml,
    wordCount: countWords(content),
  };
}

/* === Validation + preview =============================================== */

export type EssayCheck = {
  /** Hard problems that would break the live page. Save is blocked. */
  errors: string[];
  /** Cosmetic / probably-a-mistake issues. Save is still allowed. */
  warnings: string[];
  title: string;
  dateStr: string;
  /** Rendered body HTML. Empty string when a hard error stops parsing. */
  bodyHtml: string;
};

/**
 * Validate and render a full raw essay file in one pass. The editor
 * uses this for live preview AND the save route uses it to refuse a
 * broken write. The only thing that can 500 the live page is invalid
 * frontmatter (gray-matter throws), so that is the one hard error;
 * everything else is a warning.
 */
export async function checkEssaySource(raw: string): Promise<EssayCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    content = parsed.content;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(
      "The frontmatter (the block between the --- fences at the very " +
        "top) is not valid YAML, so the page can't load. " +
        msg.split("\n")[0]
    );
    return { errors, warnings, title: "", dateStr: "", bodyHtml: "" };
  }

  // Balanced token braces. An unbalanced count is almost always a typo
  // and would leak a literal {{ into the page, so treat it as hard.
  const opens = (raw.match(/\{\{/g) ?? []).length;
  const closes = (raw.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    errors.push(
      `Unbalanced token braces: ${opens} "{{" but ${closes} "}}". Every ` +
        "token opens with {{ and closes with }}."
    );
  }

  // Unknown token types render as literal text — warn, don't block.
  const tokenRe = /\{\{\s*([A-Za-z]+)\s*:/g;
  const known = new Set(["PULL", "FIGURE", "IMAGE"]);
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(raw)) !== null) {
    if (!known.has(m[1].toUpperCase())) {
      warnings.push(
        `Unknown token "{{${m[1]}:" — supported types are PULL, FIGURE, ` +
          "IMAGE. This will show up as literal text on the page."
      );
    }
  }

  if (typeof data.title !== "string" || !data.title.trim()) {
    warnings.push(
      `No "title:" in the frontmatter — the page falls back to ` +
        `"${DEFAULT_TITLE}".`
    );
  }

  const dateStr = formatEssayDate(data.date);
  if (!dateStr) {
    warnings.push(
      'No valid "date:" in the frontmatter — the dateline will be blank.'
    );
  }

  // No hard errors block rendering at this point (brace imbalance still
  // renders, just imperfectly), so always produce a preview.
  const bodyHtml = await renderEssayBody(content);

  return {
    errors,
    warnings,
    title: essayTitle(data),
    dateStr,
    bodyHtml,
  };
}
