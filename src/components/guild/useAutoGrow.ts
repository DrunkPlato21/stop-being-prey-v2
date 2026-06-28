import { useEffect } from "react";

// Grow a Guild composer textarea to fit its content so a member never has to
// drag the handle to see what they're writing. Runs on mount and on every
// value change: collapse to measure, then set the height to the content.
// The `rows` attribute still sets the inviting starting size (height:auto
// honours it while empty), and manual vertical resize keeps working.
export function useAutoGrow(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // border-box: scrollHeight covers content + padding but not the border,
    // so add it back or the box sits two pixels short and shows a scrollbar.
    const cs = getComputedStyle(el);
    const border =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + border}px`;
  }, [ref, value]);
}
