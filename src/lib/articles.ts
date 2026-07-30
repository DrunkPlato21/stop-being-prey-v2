import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import { applyLeadIncipit } from "./lead-incipit";
import { applyEssayTokens, countWords } from "./early-access";

const articlesDirectory = path.join(process.cwd(), "content", "articles");

export type ArticleMeta = {
  title: string;
  slug: string;
  date: string;
  description: string;
  subtitle?: string;
  issue?: number;
  /** Marks a major essay (a "cornerstone" - the heavy, worked pieces)
      as opposed to a dispatch (the shorter, more frequent writing). Set
      `cornerstone: true` in frontmatter. Backward-compatible: any piece
      carrying a legacy `issue` number is treated as a cornerstone too,
      so the old issues need no migration. See isCornerstone(). */
  cornerstone?: boolean;
  spotifyEpisodeId?: string;
  chapter?: number;
  wordCount?: number;
  /** Legacy: marked the "Start Here" pick on the retired podcast page.
      Currently unused; kept so existing frontmatter stays valid and a
      future featured-essay slot can reuse it. */
  featured?: boolean;
  /** Legacy companion to `featured` (the note on the old podcast card).
      Currently unused. */
  featuredNote?: string;
  /** Publish gate. Absent or true = live. `published: false` hides the
      article from every public catalog (homepage, /writing, issue
      numbering) and from static generation, while leaving its own URL
      reachable for a member/preview gate on the detail page. Flip this one
      field to true (or delete the line) to launch. */
  published?: boolean;
  /** Opt into the early-access render pipeline + typography: the
      {{PULL}}/{{FIGURE}}/{{IMAGE}} tokens and sourced-receipt blockquotes,
      plus the `.ea-essay` Act-divider spacing. Off by default so a stray
      blockquote in a normal article keeps the standard treatment. */
  essayStyle?: boolean;
  /** Override the Redis comments key. Used when a slug was renamed but the
      existing comment thread must stay attached to the original key (the
      Massie issue keeps `the-massie-eulogy` so member comments aren't
      orphaned). Falls back to the article slug when absent. */
  commentSlug?: string;
  /** Pull quote shown in the homepage "From the essay" aside when this
      article is the lead. From the `leadQuote` frontmatter field. The
      homepage falls back to a house line when the lead has none. */
  leadQuote?: string;
  /** Real audio runtime in minutes, from the `audioMinutes` frontmatter
      field. Overrides the word-count estimate everywhere the runtime is
      shown (issue masthead pill, homepage lead pill). */
  audioMinutes?: number;
  /** Set `inlineCta: false` in frontmatter to suppress the inline
      mid-article email form on this piece (for essays with no natural
      mid-point break). Defaults to on. A {{CTA}} marker in the body
      overrides placement; this kills it entirely. */
  inlineCta?: boolean;
};

/**
 * Minutes shown for an episode's audio. Prefers the real runtime
 * (`audioMinutes` frontmatter) when set; otherwise estimates from word
 * count at ~150 wpm. Null when there's nothing to base it on. Single
 * source so the issue page and homepage lead agree.
 */
export function audioRuntimeMinutes(a: ArticleMeta): number | null {
  if (typeof a.audioMinutes === "number" && a.audioMinutes > 0) {
    return a.audioMinutes;
  }
  return a.wordCount ? Math.round(a.wordCount / 150) : null;
}

/**
 * Estimated silent reading time in minutes at ~225 wpm (a typical adult
 * reading pace — faster than the ~150 wpm spoken pace audioRuntimeMinutes
 * uses). Floors at 1. Null when there's no word count to base it on.
 */
export function readingMinutes(a: ArticleMeta): number | null {
  if (!a.wordCount) return null;
  return Math.max(1, Math.round(a.wordCount / 225));
}

export type Article = ArticleMeta & {
  contentHtml: string;
  /** Optional citation block, populated when the markdown ends with a
      `## References` heading followed by a list. The body is stripped of
      both the heading and the list so it renders cleanly. */
  referencesHtml?: string | null;
  /** Optional per-article postscript override. When present, this HTML
      replaces the default rotating P.S. variants. Sourced from the
      `postscript` frontmatter field, run through the same markdown
      pipeline as the body so links and emphasis work. */
  postscriptHtml?: string | null;
  /** Optional tailored line rendered above the end-of-essay subscribe
      block, from the `closingCta` frontmatter field (markdown). Lets a
      piece make its membership ask in its own voice instead of the
      generic "More like this". Null when absent. */
  closingCtaHtml?: string | null;
  /** Optional "the argument starts here" link to an earlier issue this
      one builds on. Both fields come from frontmatter (`prequelSlug` /
      `prequelLabel`); label is stored so no extra file read is needed. */
  prequelSlug?: string;
  prequelLabel?: string;
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

/**
 * Count words in an article's markdown body. Excludes any trailing
 * `## References` block (citations aren't body words). Counts whitespace
 * separated tokens on the raw markdown source, which is close enough
 * for an editorial word count.
 */
function countBodyWords(markdown: string): number {
  const refIndex = markdown.search(/^##\s+References\s*$/im);
  const body = refIndex === -1 ? markdown : markdown.slice(0, refIndex);
  const tokens = body.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

export function getAllArticleSlugs(): string[] {
  if (!fs.existsSync(articlesDirectory)) return [];
  return fs
    .readdirSync(articlesDirectory)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Every article on disk, drafts included, newest first. Internal: the
 * public catalog goes through getAllArticles, which drops drafts. Only
 * surfaces that deliberately show unpublished work (the members-only
 * early-access card) should reach past that filter.
 */
function readAllArticleMeta(): ArticleMeta[] {
  const slugs = getAllArticleSlugs();
  const articles = slugs.map((slug) => {
    const fullPath = path.join(articlesDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);
    return {
      title: data.title,
      slug: data.slug || slug,
      date: data.date,
      description: data.description,
      subtitle: data.subtitle,
      issue: data.issue,
      cornerstone: data.cornerstone === true,
      spotifyEpisodeId: data.spotifyEpisodeId,
      chapter: data.chapter,
      // essayStyle pieces carry {{tokens}} and inline citation URLs that
      // aren't prose; count them the way the early-access view did so the
      // displayed total reflects what's actually read.
      wordCount:
        data.essayStyle === true
          ? countWords(content)
          : countBodyWords(content),
      featured: data.featured === true,
      featuredNote:
        typeof data.featuredNote === "string" ? data.featuredNote : undefined,
      published: data.published !== false,
      essayStyle: data.essayStyle === true,
      commentSlug:
        typeof data.commentSlug === "string" ? data.commentSlug : undefined,
      leadQuote:
        typeof data.leadQuote === "string" ? data.leadQuote : undefined,
      audioMinutes:
        typeof data.audioMinutes === "number" ? data.audioMinutes : undefined,
    } as ArticleMeta;
  });
  return articles.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getAllArticles(): ArticleMeta[] {
  // Drop unpublished drafts from the public catalog. This single filter
  // removes a draft from the homepage lead, /writing, and the
  // issue-number identity in one place; the detail page reads the file
  // directly via getArticleBySlug, so its URL still resolves for previews.
  return readAllArticleMeta().filter((a) => a.published !== false);
}

/**
 * The newest unpublished article, or null. Drives the members-only
 * early-access card on the Writer's Desk: a `published: false` piece is
 * readable by members at its URL but is deliberately absent from every
 * catalog, so without a surface like this no member ever learns it
 * exists. Returns meta only — the gate on the article page itself is
 * what actually controls access.
 */
export function getEarlyAccessArticle(): ArticleMeta | null {
  return readAllArticleMeta().find((a) => a.published === false) ?? null;
}

/**
 * The two tempos of the writing. A "cornerstone" is a major, worked
 * essay (the depth); a "dispatch" is a shorter, more frequent piece
 * (the pulse, the reason to check back). The distinction is set per
 * piece at publish time via `cornerstone: true`, with legacy `issue`
 * numbers grandfathered in so nothing needs migrating.
 */
export function isCornerstone(a: ArticleMeta): boolean {
  return a.cornerstone === true || typeof a.issue === "number";
}

/** Major essays, newest-first (getAllArticles is already date-sorted). */
export function getCornerstones(): ArticleMeta[] {
  return getAllArticles().filter(isCornerstone);
}

/** Dispatches (everything that isn't a cornerstone), newest-first. */
export function getDispatches(): ArticleMeta[] {
  return getAllArticles().filter((a) => !isCornerstone(a));
}

/**
 * Off-site links open in a new tab so a source citation never navigates the
 * reader out of the essay; on-site links (relative paths, or stopbeingprey.com)
 * stay in the same tab. Runs on the rendered HTML, so it covers body links, the
 * essayStyle citation captions, the references list, and the closing line
 * alike. Adds rel="noopener noreferrer" — the security + perf hygiene that
 * target="_blank" requires.
 */
function externalLinksInNewTab(htmlStr: string): string {
  return htmlStr.replace(
    /<a href="(https?:\/\/[^"]+)">/gi,
    (full, href: string) =>
      /^https?:\/\/(?:[^/]*\.)?stopbeingprey\.com(?:[/:?#]|$)/i.test(href)
        ? full
        : `<a href="${href}" target="_blank" rel="noopener noreferrer">`
  );
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const fullPath = path.join(articlesDirectory, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const essayStyle = data.essayStyle === true;

  const processedContent = await remark().use(html).process(content);
  const fullHtml = processedContent.toString();
  const { contentHtml: rawContentHtml, referencesHtml } =
    splitReferences(fullHtml);
  // `essayStyle` pieces run the early-access token pipeline
  // ({{PULL}}/{{FIGURE}}/{{IMAGE}} + sourced-receipt blockquotes) and
  // skip the lead-incipit: their opening is an epigraph pull quote, and
  // the incipit would target the wrong paragraph (and break the token).
  // Everyone else gets the standard small-caps run-in lead.
  const contentHtml = externalLinksInNewTab(
    essayStyle
      ? applyEssayTokens(rawContentHtml, {
          uniformPanelQuotes: data.uniformQuotes === true,
        })
      : applyLeadIncipit(rawContentHtml)
  );

  let postscriptHtml: string | null = null;
  if (typeof data.postscript === "string" && data.postscript.trim().length > 0) {
    const ps = await remark().use(html).process(data.postscript);
    postscriptHtml = externalLinksInNewTab(ps.toString().trim());
  }

  let closingCtaHtml: string | null = null;
  if (typeof data.closingCta === "string" && data.closingCta.trim().length > 0) {
    const c = await remark().use(html).process(data.closingCta);
    closingCtaHtml = externalLinksInNewTab(c.toString().trim());
  }

  return {
    title: data.title,
    slug: data.slug || slug,
    date: data.date,
    description: data.description,
    subtitle: data.subtitle,
    issue: data.issue,
    spotifyEpisodeId: data.spotifyEpisodeId,
    chapter: data.chapter,
    wordCount: essayStyle ? countWords(content) : countBodyWords(content),
    published: data.published !== false,
    essayStyle,
    commentSlug:
      typeof data.commentSlug === "string" ? data.commentSlug : undefined,
    leadQuote:
      typeof data.leadQuote === "string" ? data.leadQuote : undefined,
    audioMinutes:
      typeof data.audioMinutes === "number" ? data.audioMinutes : undefined,
    contentHtml,
    referencesHtml: referencesHtml ? externalLinksInNewTab(referencesHtml) : null,
    postscriptHtml,
    closingCtaHtml,
    prequelSlug:
      typeof data.prequelSlug === "string" ? data.prequelSlug : undefined,
    prequelLabel:
      typeof data.prequelLabel === "string" ? data.prequelLabel : undefined,
    inlineCta: data.inlineCta === false ? false : undefined,
  };
}
