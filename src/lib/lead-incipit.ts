// Auto-wrap the first sentence of an essay's rendered HTML in
// `<span class="lead-incipit">…</span>` so it picks up the
// publication's small-caps run-in opening register. Replaces the
// old drop-cap as the default opening treatment site-wide.
//
// Operates on the HTML output from remark-html (post-render). Safe
// no-op when:
//   - No <p> tag present
//   - First paragraph opens with an HTML tag (would break nesting;
//     authors can mark the lead manually in those rare cases)
//   - No sentence-ending punctuation found before paragraph close
//
// "First sentence" = everything from the start of the first
// paragraph up to and including the first `.`, `!`, or `?` followed
// by whitespace or paragraph close. Periods inside abbreviations
// (e.g., "U.S.") are skipped because they're not followed by space.

export function applyLeadIncipit(
  html: string,
  opts: { words?: number } = {}
): string {
  // First paragraph that isn't inside a quote. A piece that opens on a
  // quoted line (The Prisoner and the Podcasters) wants the run-in on
  // its own first sentence, not on the quote.
  const pTags = /<p[^>]*>/g;
  let pTagMatch: RegExpExecArray | null;
  while ((pTagMatch = pTags.exec(html))) {
    const before = html.slice(0, pTagMatch.index);
    const opened = (before.match(/<blockquote\b/g) ?? []).length;
    const closed = (before.match(/<\/blockquote>/g) ?? []).length;
    if (opened === closed) break;
  }
  if (!pTagMatch) return html;
  const pTagEnd = pTagMatch.index + pTagMatch[0].length;

  // Skip if the paragraph opens with an HTML tag — wrapping would
  // produce mis-nested HTML (e.g., <span><strong>X.</span></strong>).
  if (html[pTagEnd] === "<") return html;

  const rest = html.slice(pTagEnd);

  // Words mode (an essay's `leadIncipit: <n>`): the print run-in, just
  // the first few words in light spaced caps, the rest of the sentence
  // left as body text. Skipped if those words cross a tag.
  if (opts.words && opts.words > 0) {
    const wordsMatch = rest.match(
      new RegExp(`^(?:[^\\s<]+\\s+){${opts.words - 1}}[^\\s<]+`)
    );
    if (!wordsMatch) return html;
    return (
      html.slice(0, pTagEnd) +
      `<span class="lead-incipit lead-incipit--words">${wordsMatch[0]}</span>` +
      rest.slice(wordsMatch[0].length)
    );
  }

  // Find the first sentence-ending punctuation followed by either
  // whitespace or an HTML tag (paragraph close).
  const match = rest.match(/^[\s\S]*?[.!?](?=\s|<)/);
  if (!match) return html;
  // The run-in never carries a link: a link inside it renders as plain
  // run-in text (the author moves the link later in the paragraph). A
  // sentence that ends mid-link can't be unwrapped cleanly, so skip it.
  const lead = match[0].replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, "$1");
  if (/<a\b/.test(lead)) return html;

  return (
    html.slice(0, pTagEnd) +
    `<span class="lead-incipit">${lead}</span>` +
    rest.slice(match[0].length)
  );
}
