// Shared core for the patron email archive: which Kit broadcasts count
// as "an email Clay wrote", how Kit's email HTML becomes clean,
// site-styled article HTML, and the read-only Kit fetch. No Next imports,
// so the sync script (scripts/sync-email-archive.mts) and the runtime
// loader (lib/email-archive.ts) share one definition of all three.

export type KitBroadcast = {
  id: number;
  subject: string | null;
  preview_text: string | null;
  send_at: string | null;
  published_at?: string | null;
  status: string;
  content: string | null;
  subscriber_filter?: unknown;
};

// What content/emails/archive.json holds per email. Plain text is
// derived from the html at load time, so it isn't stored twice.
export type ArchivedEmail = {
  kitId: number;
  subject: string;
  preview: string;
  sentAt: string; // ISO
  html: string;
};

// List-hygiene sends that went out under Clay's name but aren't
// writing. Matched on the trimmed, lowercased subject.
const ADMIN_SUBJECTS = new Set(["still want these?", "this is the last one..."]);

/**
 * True when a broadcast belongs in the archive: sent (completed), to the
 * whole list, and not a re-engagement send. "Whole list" is read off the
 * audience filter rather than the recipient count, because the earliest
 * real emails (March 2026) went to everyone when everyone was under a
 * thousand people, while the patron-only notes and digests went to a
 * segment. Segment sends are left out.
 */
export function isArchivable(b: KitBroadcast): boolean {
  if (b.status !== "completed") return false;
  if (!b.send_at || !b.content || !b.subject?.trim()) return false;
  if (ADMIN_SUBJECTS.has(b.subject.trim().toLowerCase())) return false;
  return isWholeList(b.subscriber_filter);
}

function isWholeList(filter: unknown): boolean {
  if (!Array.isArray(filter) || filter.length !== 1) return false;
  const group = filter[0] as { all?: unknown };
  if (!Array.isArray(group?.all) || group.all.length !== 1) return false;
  return (group.all[0] as { type?: string })?.type === "all_subscribers";
}

export function toArchivedEmail(b: KitBroadcast): ArchivedEmail {
  return {
    kitId: b.id,
    subject: b.subject!.trim(),
    preview: (b.preview_text ?? "").trim(),
    sentAt: b.send_at!,
    html: sanitizeKitHtml(b.content ?? ""),
  };
}

/* === HTML ================================================================
 * Kit's "Text only" template is regular: a wrapper table, <p>s, <br/>s,
 * ck-link anchors, and blockquotes drawn as a styled div holding one or
 * more div.blockquotes-line children. This is a whitelist rewrite, not a
 * general sanitizer: anything not listed is unwrapped (kept as text) and
 * every attribute except a link's href is dropped.
 */

const KEEP = new Set([
  "p",
  "br",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "hr",
  "ul",
  "ol",
  "li",
]);
const VOID = new Set(["br", "hr"]);

export function sanitizeKitHtml(raw: string): string {
  let src = raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/​|&#x200b;|&#8203;/gi, "");
  src = resolveLiquid(src);

  const out: string[] = [];
  // One entry per open <div>, recording what its close should emit.
  const divs: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    out.push(src.slice(last, m.index));
    last = tagRe.lastIndex;
    const closing = m[1] === "/";
    let tag = m[2].toLowerCase();
    const attrs = m[3];

    if (tag === "div") {
      if (closing) {
        out.push(divs.pop() ?? "");
      } else if (/class="[^"]*\bblockquotes-line\b/.test(attrs)) {
        out.push("<p>");
        divs.push("</p>");
      } else if (/class="[^"]*\bblockquotes\b/.test(attrs)) {
        out.push("<blockquote>");
        divs.push("</blockquote>");
      } else {
        divs.push("");
      }
      continue;
    }

    // The one long-form send carries its own title as an h1; the page
    // already prints the subject, so it steps down a level.
    if (tag === "h1") tag = "h2";
    if (tag === "b") tag = "strong";
    if (tag === "i") tag = "em";
    if (!KEEP.has(tag)) continue;

    if (closing) {
      if (!VOID.has(tag)) out.push(`</${tag}>`);
      continue;
    }
    if (tag === "a") {
      const href = /href="([^"]*)"/i.exec(attrs)?.[1] ?? "";
      if (/^(https?:|mailto:)/i.test(href)) {
        out.push(
          `<a href="${href}" target="_blank" rel="noopener noreferrer">`
        );
      } else {
        out.push("<a>");
      }
      continue;
    }
    out.push(`<${tag}>`);
  }
  out.push(src.slice(last));

  return out
    .join("")
    // Kit leaves spacer paragraphs (often just a <br>) between blocks.
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/gi, "")
    // A <br> hugging either end of a paragraph is invisible spacing.
    .replace(/<p>(\s*<br>)+/gi, "<p>")
    .replace(/(<br>\s*)+<\/p>/gi, "</p>")
    .replace(/<a>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Merge tags. Only first_name has ever been used; resolve any
// `{{ subscriber.x | default: "y" }}` to its default (or nothing), then
// close the gap it leaves ("Hey ," becomes "Hey,").
function resolveLiquid(src: string): string {
  return src
    .replace(/\{\{[^}]*?default:\s*(?:&quot;|")(.*?)(?:&quot;|")\s*\}\}/g, "$1")
    .replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, "")
    .replace(/[ \t]+([,.!?])/g, "$1");
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X"
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

/** Plain text for search and excerpts: block ends become newlines. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br>/g, "\n")
      .replace(/<\/(p|li|h2|h3|blockquote)>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/* === Kit =================================================================
 * Read-only. GET /v4/broadcasts returns newest first with the full HTML
 * content inline, so one paged walk is the whole fetch.
 */

const KIT_BROADCASTS = "https://api.kit.com/v4/broadcasts";

export async function fetchKitBroadcasts(opts: {
  apiKey: string;
  perPage?: number;
  maxPages?: number;
  /** Stop paging once a page reaches a broadcast with an id this old. */
  stopAtOrBelowId?: number;
  fetchInit?: RequestInit;
}): Promise<KitBroadcast[]> {
  const perPage = opts.perPage ?? 1000;
  const maxPages = opts.maxPages ?? 20;
  const all: KitBroadcast[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(KIT_BROADCASTS);
    url.searchParams.set("per_page", String(perPage));
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, {
      ...opts.fetchInit,
      headers: { "X-Kit-Api-Key": opts.apiKey, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Kit broadcasts ${res.status}`);
    const body = (await res.json()) as {
      broadcasts: KitBroadcast[];
      pagination?: { has_next_page?: boolean; end_cursor?: string | null };
    };
    all.push(...body.broadcasts);
    const reachedKnown =
      opts.stopAtOrBelowId !== undefined &&
      body.broadcasts.some((b) => b.id <= opts.stopAtOrBelowId!);
    if (reachedKnown || !body.pagination?.has_next_page) break;
    after = body.pagination.end_cursor ?? null;
    if (!after) break;
  }
  return all;
}
