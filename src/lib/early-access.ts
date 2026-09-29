// Essay token pipeline. The filename is historical: this module began
// as the early-access essay system (markdown under content/early-access
// with a localhost authoring editor). That directory and editor are
// gone — early access now flows from `published: false` articles in
// content/articles (see getEarlyAccessArticle in src/lib/articles.ts).
// What survives is the part everything still leans on: the
// {{PULL}}/{{FIGURE}}/{{IMAGE}} token transforms and the blockquote
// treatments that `essayStyle: true` pieces run through, plus the
// token-aware word counter. One source of truth, no drift.

/**
 * {{SERIES: label | line | line | …}} -> the series block that closes a
 * piece in a run (The Libertarian Series). A line with a link points at
 * another part; the one line without a link is the piece being read,
 * and is marked as current. Exported on its own because series pieces
 * that aren't `essayStyle` (The Losertarian Problem) carry it too.
 */
export function applySeriesToken(input: string): string {
  return input.replace(
    /<p>\s*\{\{SERIES:\s*([\s\S]*?)\}\}\s*<\/p>/g,
    (_m, inner: string) => {
      const [label, ...lines] = inner.split("|").map((s) => s.trim());
      const items = lines
        .map((line) =>
          /<a\b/.test(line)
            ? `<li>${line}</li>`
            : `<li class="is-current" aria-current="page">${line}</li>`
        )
        .join("");
      return (
        `<aside class="ea-series" aria-label="${(label ?? "").replace(/"/g, "&quot;")}">` +
        `<p class="ea-series-label">${label ?? ""}</p><ol>${items}</ol></aside>`
      );
    }
  );
}

/**
 * Apply the custom token + blockquote treatments to already-rendered
 * markdown HTML. The standard article pipeline (src/lib/articles.ts)
 * runs this for essays that opt in via `essayStyle: true` in their
 * frontmatter.
 *
 * NOTE: this rewrites EVERY <blockquote> into a sourced-receipt figure, so
 * only call it on bodies that intend that treatment. The article pipeline
 * gates it behind the `essayStyle` flag for exactly this reason.
 *
 * `opts.uniformPanelQuotes` forces every quote into the glyph panel
 * (ea-blockquote), skipping the light centered treatment for short
 * unattributed one-liners. Use it on pieces where mixing the two styles
 * reads as incoherent and one consistent quote form is wanted.
 */
export function applyEssayTokens(
  input: string,
  opts: { uniformPanelQuotes?: boolean } = {}
): string {
  let bodyHtml = input;

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

  bodyHtml = applySeriesToken(bodyHtml);

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
      // {{EPIGRAPH}} as the first paragraph inside the blockquote marks
      // this quote as an epigraph: the standing-inscription kind that
      // opens an Act, not a receipt quoted inside the narrative. Explicit
      // marker, never positional — "first quote in a section" would catch
      // the wrong quotes the moment an Act is reordered or a receipt moves
      // to the top. The marker paragraph is consumed, never rendered.
      //
      // The same first-paragraph marker picks the other voices a piece
      // can quote, so a page of twenty quotes isn't twenty identical
      // panels (The Prisoner and the Podcasters, 2026-09-28):
      //   {{POST}}     a post or broadcast, the receipt: between rules,
      //                source on top
      //   {{ARCHIVE}}  Clay quoting his own earlier piece: left rule,
      //                "from the archive" kicker
      //   {{SOUND}}    something overheard: a recorded voice, a chant,
      //   {{CHANT}}    a sign. All three share one quiet small-caps
      //   {{SIGN}}     line; the separate names keep the markdown legible
      //   {{REFRAIN}}  a line that returns: the light centered beat,
      //                even when uniformQuotes is on
      let marker: string | null = null;
      {
        const firstP = quoteInner.match(
          /^\s*<p>\s*\{\{\s*(EPIGRAPH|POST|ARCHIVE|SOUND|CHANT|SIGN|REFRAIN)\s*\}\}\s*<\/p>/i
        );
        if (firstP) {
          marker = firstP[1].toUpperCase();
          quoteInner = quoteInner.slice(firstP[0].length).trimStart();
        }
      }
      const isEpigraph = marker === "EPIGRAPH";
      const unquoted = quoteInner
        .replace(/^(\s*<p>\s*(?:<em>\s*)?)["“]/, "$1")
        .replace(/["”](\s*(?:<\/em>\s*)?<\/p>\s*)$/, "$1");
      const credit = formatCredit(attr);
      if (marker === "POST") {
        // Print-style: the quote first, the source beneath it.
        const foot = attr ? `<figcaption>${credit}</figcaption>` : "";
        return `<figure class="ea-post"><blockquote>${unquoted}</blockquote>${foot}</figure>`;
      }
      if (marker === "ARCHIVE") {
        // Clay's own earlier writing. Credit beneath, like the record
        // quotes; the olive rule is what marks it as his.
        const foot = `<figcaption>From the archive${attr ? ` · ${credit}` : ""}</figcaption>`;
        return `<figure class="ea-archive"><blockquote>${unquoted}</blockquote>${foot}</figure>`;
      }
      if (marker === "SOUND" || marker === "CHANT" || marker === "SIGN") {
        // One quiet treatment for everything overheard. Three separate
        // costumes (placard, crowd caps, operator line) read as a zine.
        return `<figure class="ea-sound"><blockquote>${unquoted}</blockquote></figure>`;
      }
      if (marker === "REFRAIN") {
        return `<figure class="ea-quote-light ea-refrain"><blockquote>${quoteInner}</blockquote></figure>`;
      }
      if (isEpigraph) {
        // Its own figure class, not a modifier on ea-blockquote: the
        // epigraph shares none of the panel's ornament (no oversized
        // glyph, no rule above the attribution), so inheriting them just
        // to unset them again invites drift.
        const strippedEpi = quoteInner
          .replace(/^(\s*<p>\s*(?:<em>\s*)?)["“]/, "$1")
          .replace(/["”](\s*(?:<\/em>\s*)?<\/p>\s*)$/, "$1");
        const epiCap = attr ? `<figcaption>${credit}</figcaption>` : "";
        return `<figure class="ea-epigraph"><blockquote>${strippedEpi}</blockquote>${epiCap}</figure>`;
      }

      // Short, unattributed one-liner -> light treatment (no panel).
      // Suppressed when uniformPanelQuotes is on: the piece wants every
      // quote in the glyph panel, so don't peel short ones off into the
      // centered light style.
      if (!attr && !opts.uniformPanelQuotes) {
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
      const cap = attr ? `<figcaption>${credit}</figcaption>` : "";
      return `<figure class="ea-blockquote"><blockquote>${stripped}</blockquote>${cap}</figure>`;
    }
  );

  return bodyHtml;
}

/**
 * An attribution line ("Dave Smith, Part of the Problem, Sept 23, 2026")
 * as a credit: one separator everywhere (·), and the comma before a year
 * kept, so dates read "Sept 23, 2026". Each part stays whole on one line
 * so a phone never strands "Sept" from "23, 2026", unless a part would
 * split a link (a whole-line link like "[Charlie Kirk, X, April 22,
 * 2024](…)"), in which case it only swaps the separators.
 */
function formatCredit(attr: string): string {
  if (!attr) return "";
  const parts = attr.split(/,\s+(?!\d{4}\b)/);
  const balanced = parts.every(
    (p) => (p.match(/<a\b/g) ?? []).length === (p.match(/<\/a>/g) ?? []).length
  );
  if (!balanced) return attr.replace(/,\s+(?!\d{4}\b)/g, " · ");
  return parts
    .map((p) => `<span style="white-space:nowrap">${p}</span>`)
    .join(" · ");
}

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
