// Quote cards: a reader highlights a line in an essay and shares it as
// an image. The image route renders whatever line it's handed, so the
// one rule that matters lives here: a card only ever carries words that
// are actually in the essay. Without that check the route is a free
// generator for fake Clay quotes on the house letterhead.
//
// Matching is deliberately forgiving about the things a browser
// selection mangles (whitespace runs, paragraph breaks, curly vs
// straight quotes) and strict about everything else. The card then
// renders the ESSAY's own slice of text, not the caller's string, so
// the typography on the card is Clay's typography even when the match
// went through normalization.

import { stripCtaMarker } from "@/lib/inline-cta";

/** Shortest selection that gets a share bar. Below this it's a word or
    two, not a line, and the bar would fire on every double-click. */
export const QUOTE_MIN_CHARS = 12;
/** Longest selection that gets a share bar. Roughly a tweet, and about
    the most a 1200x630 card holds before the type gets too small to
    read at thumbnail size. */
export const QUOTE_MAX_CHARS = 280;
// The route accepts a little more than the client sends, because the
// server snaps a match out to whole words and that can add a few
// characters at either end.
const QUOTE_HARD_CAP = QUOTE_MAX_CHARS + 40;

// Tags that end a line of reading. Replaced with a space so two
// paragraphs never fuse into one word ("endStart"). Every other tag
// (em, strong, a, span) is inline and removed with no space, so
// "<em>never</em>s" stays one word.
const BLOCK_TAG_RE =
  /<\/?(?:p|h[1-6]|li|ul|ol|blockquote|figure|figcaption|div|section|aside|header|footer|br|hr|tr|td|th|table|pre)\b[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
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
  mdash: String.fromCharCode(0x2014),
  ndash: String.fromCharCode(0x2013),
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (full, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? full;
  });
}

/** The essay body as the reader sees it: tags out, entities decoded. */
export function articlePlainText(contentHtml: string): string {
  return decodeEntities(
    stripCtaMarker(contentHtml)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(BLOCK_TAG_RE, " ")
      .replace(/<[^>]+>/g, "")
  );
}

/**
 * Fold the differences a selection introduces, keeping a map from each
 * output character back to its index in the input. Whitespace runs
 * collapse to one space; curly quotes fold to straight; invisible
 * characters (soft hyphen, zero-width) drop out.
 */
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (/[­​-‍⁠﻿]/.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (inSpace) continue;
      inSpace = true;
      text += " ";
      map.push(i);
      continue;
    }
    inSpace = false;
    if (ch === "‘" || ch === "’" || ch === "ʼ") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    text += ch;
    map.push(i);
  }
  return { text, map };
}

/** Collapse whitespace and trim. What the client sends; what X gets. */
export function tidyQuote(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

// An apostrophe counts as part of a word only between two letters
// ("don't"), so snapping never swallows a closing quote mark.
function isWordAt(s: string, i: number): boolean {
  const ch = s[i];
  if (ch === undefined) return false;
  if (WORD_CHAR.test(ch)) return true;
  if (ch === "'" || ch === "’") {
    return WORD_CHAR.test(s[i - 1] ?? "") && WORD_CHAR.test(s[i + 1] ?? "");
  }
  return false;
}

/**
 * Find `candidate` in the essay and return the essay's own text for it,
 * snapped out to whole words, or null when it isn't there. Snapping is
 * what stops a mid-word drag from producing a card that says "rapist"
 * out of "therapist".
 */
export function findQuoteInArticle(
  contentHtml: string,
  candidate: string
): string | null {
  if (typeof candidate !== "string" || candidate.length > QUOTE_HARD_CAP * 2) {
    return null;
  }
  const needle = normalizeWithMap(tidyQuote(candidate)).text;
  if (needle.length < QUOTE_MIN_CHARS || needle.length > QUOTE_HARD_CAP) {
    return null;
  }
  const plain = articlePlainText(contentHtml);
  const hay = normalizeWithMap(plain);
  const at = hay.text.indexOf(needle);
  if (at === -1) return null;

  let start = hay.map[at];
  let end = hay.map[at + needle.length - 1] + 1;
  while (start > 0 && isWordAt(plain, start) && isWordAt(plain, start - 1)) {
    start--;
  }
  while (end < plain.length && isWordAt(plain, end - 1) && isWordAt(plain, end)) {
    end++;
  }
  const quote = tidyQuote(plain.slice(start, end));
  if (quote.length < QUOTE_MIN_CHARS || quote.length > QUOTE_HARD_CAP) {
    return null;
  }
  return quote;
}
