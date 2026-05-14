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

export function applyLeadIncipit(html: string): string {
  const pTagMatch = html.match(/<p[^>]*>/);
  if (!pTagMatch || pTagMatch.index === undefined) return html;
  const pTagEnd = pTagMatch.index + pTagMatch[0].length;

  // Skip if the paragraph opens with an HTML tag — wrapping would
  // produce mis-nested HTML (e.g., <span><strong>X.</span></strong>).
  if (html[pTagEnd] === "<") return html;

  // Find the first sentence-ending punctuation followed by either
  // whitespace or an HTML tag (paragraph close).
  const rest = html.slice(pTagEnd);
  const match = rest.match(/^[\s\S]*?[.!?](?=\s|<)/);
  if (!match) return html;
  const lead = match[0];

  return (
    html.slice(0, pTagEnd) +
    `<span class="lead-incipit">${lead}</span>` +
    rest.slice(lead.length)
  );
}
