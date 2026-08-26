"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

// Textarea that grows with its content. Initial size = `minRows`,
// expands as needed. Pass `maxRows` to cap the growth and let it scroll
// past that — worth it only for the long-form admin editors, where a
// whole article's worth of unbounded box would swallow the page.
//
// Works controlled OR uncontrolled. Controlled callers pass `value` and
// the layout effect re-measures on every change. Uncontrolled callers
// (the Arena composers post to a server action by `name`, with no React
// state behind them) are covered by the `input` handler, which fires on
// every keystroke and paste regardless. Both paths call the same
// measure, so neither is a special case.
//
// The layout effect (vs. plain useEffect) runs before paint, so the
// height is correct on the very first render when value is non-empty
// — important for the reply composer which auto-focuses on open.
//
// Forwards a ref to the underlying <textarea> so wrapper components
// (e.g. the @-mention picker) can read/write selection state without
// breaking the auto-resize behavior.

export type AutoResizingTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "rows" | "ref"
> & {
  /** Present for controlled callers; absent for uncontrolled ones. */
  value?: string;
  minRows?: number;
  /** Cap growth at this many rows, scrolling beyond it. Uncapped when unset. */
  maxRows?: number;
};

export const AutoResizingTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoResizingTextareaProps
>(function AutoResizingTextarea(
  { value, minRows = 2, maxRows, style, onInput, ...rest },
  externalRef
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(externalRef, () => innerRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    // Not currently rendered — the Arena bench hides its body box behind
    // display:none while the preview is on screen. A hidden element
    // reports scrollHeight 0, so measuring here would pin the height to
    // 0px and the box would come back from preview collapsed. Leaving
    // the last good height alone is correct: the content did not change
    // while it was hidden. getClientRects (rather than offsetParent)
    // because a position:fixed box is visible but has no offsetParent.
    if (el.getClientRects().length === 0) return;
    // Reset to "auto" first so the textarea can shrink when content
    // is deleted. Without this, scrollHeight stays at the previous
    // taller value and the box never gets smaller.
    //
    // That reset also shortens the document for an instant. Scrolled
    // past the page's new end, the browser clamps the scroll position
    // to that new bottom, and restoring the height a line later leaves
    // the member somewhere they didn't put themselves — in a tall box,
    // the view appears to jump on every keystroke. Remember where they
    // were, measure, put them back. Instant on purpose: the site sets
    // scroll-behavior: smooth globally, which would animate the
    // correction and make an invisible fix a visible slide.
    const top = window.scrollY;
    const left = window.scrollX;
    el.style.height = "auto";
    const content = el.scrollHeight;

    let next = content;
    if (maxRows && maxRows > 0) {
      const cs = window.getComputedStyle(el);
      // lineHeight computes to "normal" on some stacks, which parses to
      // NaN. Fall back to the usual ~1.2 ratio rather than collapsing
      // the cap to the padding alone.
      const lineHeight =
        Number.parseFloat(cs.lineHeight) ||
        Number.parseFloat(cs.fontSize) * 1.2;
      const vertical =
        Number.parseFloat(cs.paddingTop) +
        Number.parseFloat(cs.paddingBottom) +
        (cs.boxSizing === "border-box"
          ? Number.parseFloat(cs.borderTopWidth) +
            Number.parseFloat(cs.borderBottomWidth)
          : 0);
      const cap = lineHeight * maxRows + vertical;
      if (Number.isFinite(cap)) next = Math.min(content, cap);
    }

    el.style.height = `${next}px`;
    // Only show a scrollbar when the cap actually bit. Uncapped boxes
    // stay overflow-hidden so no bar ever flickers mid-keystroke.
    el.style.overflowY = content > next ? "auto" : "hidden";

    if (window.scrollY !== top || window.scrollX !== left) {
      window.scrollTo({ top, left, behavior: "instant" });
    }
  }, [maxRows]);

  // Controlled callers re-measure on every value change. Uncontrolled
  // ones get the mount pass, which sizes any defaultValue correctly;
  // typing is handled by onInput below.
  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  // On first mount, when autoFocus + an initial value combine (the
  // reply composer prefills `@<name> ` when the user clicks reply on
  // a reply), drop the cursor at the end of that prefill so they can
  // start typing right after the @mention instead of in front of it.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (rest.autoFocus && typeof value === "string" && value.length > 0) {
      const end = value.length;
      el.setSelectionRange(end, end);
    }
    // Run on mount only — subsequent value changes shouldn't yank the
    // user's cursor around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={innerRef}
      value={value}
      rows={minRows}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      style={{
        // Hide the native resize handle — the textarea size follows the
        // content, so there's nothing to drag. overflowY is managed in
        // resize(); this is only the pre-measure default.
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
});
