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
};

const TOOLS = [
  { key: "bold", glyph: "B", title: "Bold", glyphStyle: { fontWeight: 700 } },
  { key: "italic", glyph: "I", title: "Italic", glyphStyle: { fontStyle: "italic" } },
  { key: "quote", glyph: "”", title: "Quote", glyphStyle: { fontWeight: 700, fontSize: "1.25rem" } },
] as const;

export function FormatToolbar({ textareaRef, value, onChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

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
      style={{ display: "flex", gap: "0.4rem", marginBottom: "0.6rem" }}
      aria-label="Formatting"
    >
      {TOOLS.map((t) => {
        const isHover = hovered === t.key;
        return (
          <button
            key={t.key}
            type="button"
            title={t.title}
            aria-label={t.title}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => run(t.key)}
            style={{
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
              cursor: "pointer",
              transition: "color .15s, border-color .15s, background .15s",
              ...t.glyphStyle,
            }}
          >
            {t.glyph}
          </button>
        );
      })}
    </div>
  );
}
