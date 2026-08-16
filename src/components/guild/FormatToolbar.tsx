"use client";

import React, { useState } from "react";

// Tiny formatting toolbar for the Guild composers. Wraps the current
// textarea selection in the markdown subset the body renderer understands
// (**bold**, *italic*, and "> " quote lines). Three quiet buttons, not a
// word processor. Styled inline on purpose so Tailwind's button reset
// can't strip the borders.

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  // Write/preview toggle, parked at the right end of the same row. Omit
  // both and the toolbar is exactly the three buttons it always was.
  previewing?: boolean;
  onTogglePreview?: () => void;
};

const TOOLS = [
  { key: "bold", glyph: "B", label: "Bold", title: "Bold", glyphStyle: { fontWeight: 700 } },
  { key: "italic", glyph: "I", label: "Italic", title: "Italic", glyphStyle: { fontStyle: "italic" } },
  // The quote title spells out the selection behavior: a member's
  // instinct is to select a sentence and expect it to pop out, and the
  // tooltip is the only place to say that is exactly what happens.
  {
    key: "quote",
    glyph: "”",
    label: "Quote",
    title: "Quote. Select any part of a paragraph to pop just that part out.",
    glyphStyle: { fontWeight: 700, fontSize: "1.25rem" },
  },
] as const;

export function FormatToolbar({
  textareaRef,
  value,
  onChange,
  previewing = false,
  onTogglePreview,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [toggleHover, setToggleHover] = useState(false);

  function restoreSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }

  function wrap(marker: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next =
      value.slice(0, start) + marker + selected + marker + value.slice(end);
    onChange(next);
    restoreSelection(
      start + marker.length,
      start + marker.length + selected.length
    );
  }

  function quote() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = value.indexOf("\n", end);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const before = value.slice(lineStart, start);
    const after = value.slice(end, lineEnd);

    // A sentence selected mid-paragraph pops out onto its own quote
    // line, with the rest of the paragraph kept intact above and below.
    // The renderer is line-based, so without the split the "> " prefix
    // would swallow the whole paragraph.
    if (start !== end && (before.trim() !== "" || after.trim() !== "")) {
      const quoted = value
        .slice(start, end)
        .split("\n")
        .map((line) => (line.startsWith("> ") ? line : `> ${line.trim()}`))
        .join("\n");
      const beforeKept = before.trimEnd();
      const pieces = [beforeKept, quoted, after.trimStart()].filter(
        (p) => p !== ""
      );
      const next =
        value.slice(0, lineStart) + pieces.join("\n") + value.slice(lineEnd);
      const quotedStart =
        lineStart + (beforeKept === "" ? 0 : beforeKept.length + 1);
      onChange(next);
      restoreSelection(quotedStart, quotedStart + quoted.length);
      return;
    }

    // No selection, or the selection already spans whole lines: quote
    // the full line(s), as before.
    const segment = value.slice(lineStart, end);
    const quoted = segment
      .split("\n")
      .map((line) => (line.startsWith("> ") ? line : `> ${line}`))
      .join("\n");
    const next = value.slice(0, lineStart) + quoted + value.slice(end);
    onChange(next);
    restoreSelection(lineStart, lineStart + quoted.length);
  }

  function run(key: string) {
    if (key === "bold") wrap("**");
    else if (key === "italic") wrap("*");
    else quote();
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        marginBottom: "0.6rem",
      }}
      aria-label="Formatting"
    >
      {TOOLS.map((t) => {
        const isHover = hovered === t.key && !previewing;
        return (
          <button
            key={t.key}
            type="button"
            title={t.title}
            aria-label={t.label}
            disabled={previewing}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => run(t.key)}
            style={{
              opacity: previewing ? 0.4 : 1,
              width: "2.3rem",
              height: "2.3rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${isHover ? "var(--eye-deep)" : "var(--rule)"}`,
              borderRadius: "5px",
              background: isHover ? "var(--paper-deep)" : "var(--surface)",
              color: isHover ? "var(--eye-deep)" : "var(--ink-muted)",
              fontFamily: "var(--font-source-serif), Georgia, 'Times New Roman', serif",
              fontSize: "1.05rem",
              lineHeight: 1,
              cursor: previewing ? "default" : "pointer",
              transition: "color .15s, border-color .15s, background .15s",
              ...t.glyphStyle,
            }}
          >
            {t.glyph}
          </button>
        );
      })}
      {onTogglePreview && (
        // Self-labelling: it says the room it takes you to, never the room
        // you're in. Same 2.3rem height as the glyph boxes so the row keeps
        // one baseline.
        <button
          type="button"
          onClick={onTogglePreview}
          onMouseEnter={() => setToggleHover(true)}
          onMouseLeave={() => setToggleHover(false)}
          aria-pressed={previewing}
          className="font-display uppercase tracking-[0.18em]"
          style={{
            marginLeft: "auto",
            height: "2.3rem",
            padding: "0 0.6rem",
            display: "inline-flex",
            alignItems: "center",
            background: "transparent",
            border: 0,
            color: toggleHover || previewing ? "var(--eye-deep)" : "var(--ink-faint)",
            fontSize: "0.64rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "color .15s",
          }}
        >
          {previewing ? "Write" : "Preview"}
        </button>
      )}
    </div>
  );
}
