"use client";

import React from "react";

// Tiny formatting toolbar for the Guild composers. Wraps the current
// textarea selection in the markdown subset the body renderer understands
// (**bold**, *italic*, and "> " quote lines). Three quiet buttons, not a
// word processor — enough to lay out an argument or cite a line.

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
};

export function FormatToolbar({ textareaRef, value, onChange }: Props) {
  function restoreSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }

  // Wrap the selection (or insert a placeholder) in inline markers.
  function wrap(marker: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next =
      value.slice(0, start) +
      marker +
      selected +
      marker +
      value.slice(end);
    onChange(next);
    restoreSelection(start + marker.length, start + marker.length + selected.length);
  }

  // Prefix each selected line with "> ". Expands to the start of the first
  // line so a quote always begins at a line boundary.
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

  return (
    <div className="guild-format-toolbar" aria-label="Formatting">
      <button type="button" onClick={() => wrap("**")} title="Bold">
        <strong>B</strong>
      </button>
      <button type="button" onClick={() => wrap("*")} title="Italic">
        <em>I</em>
      </button>
      <button type="button" onClick={quote} title="Quote">
        &rdquo;
      </button>
    </div>
  );
}
