import React from "react";
import { Linkified } from "@/components/Linkified";
import { YouTubeEmbed } from "./YouTubeEmbed";

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
// Bold may cross a soft line break: members use it as a two-line heading —
// a label, then its gloss — so "**Rule II:\nI lay my traps.**" has to bold
// across the newline. Italic stays single-line on purpose: a lone "*" is
// easy to type by accident, and letting one span paragraphs would swallow
// whole blocks between two unrelated stars.
const INLINE_RE = /(\*\*[^*]+?\*\*|\*[^*\n]+?\*)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(
        <Linkified
          key={`${keyPrefix}-t${i}`}
          text={text.slice(last, m.index)}
          highlightMentions
        />
      );
    }
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`}>
          <Linkified text={tok.slice(2, -2)} highlightMentions />
        </strong>
      );
    } else {
      out.push(
        <em key={`${keyPrefix}-i${i}`}>
          <Linkified text={tok.slice(1, -1)} highlightMentions />
        </em>
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length || out.length === 0) {
    out.push(
      <Linkified
        key={`${keyPrefix}-t${i}`}
        text={text.slice(last)}
        highlightMentions
      />
    );
  }
  return out;
}

// The posted-body look, in one place. The renderer is shared by the live
// thread/reply body and by the composer's preview, so the two can never
// drift: what a member sees in preview is the same nodes in the same type.
export const GUILD_BODY_STYLE: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: "1.05rem",
  lineHeight: 1.7,
  color: "var(--ink-soft)",
};

const QUOTE_RE = /^>\s?/;

// A YouTube link on a line by itself becomes a click-to-play video. A link
// in the middle of a sentence stays an ordinary link, so members choose by
// where they paste it. Covers watch?v=, youtu.be/, /shorts/ and /live/.
const YT_LINE_RE =
  /^\s*(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?\S*?\bv=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})\S*\s*$/i;

// "?t=90", "&t=1m30s", "?start=90" -> seconds.
function youtubeStart(url: string): number | undefined {
  const m = url.match(/[?&#](?:t|start)=([\dhms]+)/i);
  if (!m) return undefined;
  const v = m[1];
  if (/^\d+$/.test(v)) return Number(v) || undefined;
  const h = Number(v.match(/(\d+)h/)?.[1] ?? 0);
  const min = Number(v.match(/(\d+)m/)?.[1] ?? 0);
  const s = Number(v.match(/(\d+)s/)?.[1] ?? 0);
  return h * 3600 + min * 60 + s || undefined;
}

// Plain lines, with any standalone YouTube line pulled out as a video.
// Bodies without one render exactly as before. Blank lines hugging a video
// are dropped, since the video block brings its own spacing.
function renderPlain(lines: string[], keyPrefix: string): React.ReactNode[] {
  if (!lines.some((l) => YT_LINE_RE.test(l))) {
    return renderInline(lines.join("\n"), keyPrefix);
  }
  const out: React.ReactNode[] = [];
  let run: string[] = [];
  let n = 0;
  const flush = () => {
    while (run.length && run[0].trim() === "") run.shift();
    while (run.length && run[run.length - 1].trim() === "") run.pop();
    if (run.length) out.push(...renderInline(run.join("\n"), `${keyPrefix}-${n}`));
    run = [];
    n++;
  };
  for (const line of lines) {
    const yt = line.match(YT_LINE_RE);
    if (!yt) {
      run.push(line);
      continue;
    }
    flush();
    const url = line.trim();
    out.push(
      <YouTubeEmbed
        key={`${keyPrefix}-yt${n}`}
        id={yt[1]}
        start={youtubeStart(url)}
        url={/^https?:\/\//i.test(url) ? url : `https://${url}`}
      />
    );
  }
  flush();
  return out;
}

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
          {renderPlain(normal, `n${key}`)}
        </React.Fragment>
      );
    }
    key++;
  }
  return blocks;
}
