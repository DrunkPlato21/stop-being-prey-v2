import React from "react";
import { Linkified } from "@/components/Linkified";

// Lightweight Guild body formatter: a tiny markdown subset so members can
// lay out an argument without a word processor. Supports:
//   - **bold**
//   - *italic*
//   - lines starting with "> " become a quote block
// Everything else (URLs, line breaks) is preserved exactly as before, since
// every plain run is still rendered through <Linkified>. Deliberately
// minimal: no headings, lists, or nesting. Enough to make a point land.

// One token = a bold span OR an italic span. Bold is tried first so "**x**"
// doesn't get mistaken for two italics. The inner text has no markers.
const INLINE_RE = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <Linkified key={`${keyPrefix}-t${i}`} text={text.slice(last, m.index)} />
      );
    }
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`}>
          <Linkified text={tok.slice(2, -2)} />
        </strong>
      );
    } else {
      out.push(
        <em key={`${keyPrefix}-i${i}`}>
          <Linkified text={tok.slice(1, -1)} />
        </em>
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length || out.length === 0) {
    out.push(<Linkified key={`${keyPrefix}-t${i}`} text={text.slice(last)} />);
  }
  return out;
}

const QUOTE_RE = /^>\s?/;

export function formatGuildBody(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    if (QUOTE_RE.test(lines[i])) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE_RE, ""));
        i++;
      }
      blocks.push(
        <blockquote key={`q${key}`} className="guild-quote">
          {renderInline(quoted.join("\n"), `q${key}`)}
        </blockquote>
      );
    } else {
      const normal: string[] = [];
      while (i < lines.length && !QUOTE_RE.test(lines[i])) {
        normal.push(lines[i]);
        i++;
      }
      blocks.push(
        <React.Fragment key={`n${key}`}>
          {renderInline(normal.join("\n"), `n${key}`)}
        </React.Fragment>
      );
    }
    key++;
  }
  return blocks;
}
