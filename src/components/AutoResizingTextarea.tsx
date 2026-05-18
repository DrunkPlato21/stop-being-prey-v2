"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

// Textarea that grows with its content. Initial size = `minRows`,
// expands as needed up to whatever the browser can fit.
//
// The layout effect (vs. plain useEffect) runs before paint, so the
// height is correct on the very first render when value is non-empty
// — important for the reply composer which auto-focuses on open.
//
// Forwards a ref to the underlying <textarea> so wrapper components
// (e.g. the @-mention picker) can read/write selection state without
// breaking the auto-resize behavior.

export type AutoResizingTextareaProps =
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "ref"> & {
    value: string;
    minRows?: number;
  };

export const AutoResizingTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoResizingTextareaProps
>(function AutoResizingTextarea(
  { value, minRows = 2, style, ...rest },
  externalRef
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(externalRef, () => innerRef.current as HTMLTextAreaElement);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // Reset to "auto" first so the textarea can shrink when content
    // is deleted. Without this, scrollHeight stays at the previous
    // taller value and the box never gets smaller.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

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
      style={{
        // Hide the native resize handle and the scrollbar — the
        // textarea size follows the content, no manual resize needed.
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
});
