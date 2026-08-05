"use client";

import { flushSync } from "react-dom";
import { useState } from "react";
import { GUILD_BODY_STYLE, formatGuildBody } from "./format-body";

// Read-mode for a Guild composer. Renders the draft through the exact same
// formatter the posted thread uses, so "**like this**" reads as bold instead
// of as stars. Dashed border on purpose: it reads as a held-up sheet, not as
// another box you can type into.

export function ComposerPreview({
  text,
  minHeight,
}: {
  text: string;
  // The height the textarea had when the member tapped Preview. Keeps the
  // page from jumping under a thumb on the way in and out.
  minHeight?: number;
}) {
  const empty = !text.trim();
  return (
    <div
      aria-live="polite"
      style={{
        border: "1px dashed var(--rule)",
        borderRadius: 2,
        background: "var(--surface)",
        padding: "0.8rem",
        minHeight,
      }}
    >
      {empty ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.9rem",
            fontStyle: "italic",
            color: "var(--ink-faint)",
          }}
        >
          Nothing written yet.
        </p>
      ) : (
        <div style={GUILD_BODY_STYLE}>{formatGuildBody(text)}</div>
      )}
    </div>
  );
}

/**
 * Write/preview state for one composer. Kept in a hook so all four Guild
 * composers get identical behaviour from three lines each.
 */
export function useComposerPreview(
  ref: React.RefObject<HTMLTextAreaElement | null>
) {
  const [previewing, setPreviewing] = useState(false);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);

  function toggle() {
    if (!previewing) {
      const h = ref.current?.offsetHeight;
      if (h) setMinHeight(h);
      setPreviewing(true);
      return;
    }
    // Flush synchronously so the textarea is back in the DOM before we
    // focus it, inside the same tap. Any later (rAF, effect) and iOS no
    // longer counts it as user-initiated, so the keyboard stays down and
    // "Write" leaves you looking at a box you have to tap again.
    flushSync(() => setPreviewing(false));
    ref.current?.focus();
  }

  return { previewing, minHeight, toggle };
}
