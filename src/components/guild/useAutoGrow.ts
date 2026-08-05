import { useEffect, useLayoutEffect } from "react";

// Grow a Guild composer textarea to fit its content so a member never has to
// drag the handle to see what they're writing. Runs on mount and on every
// value change: collapse to measure, then set the height to the content.
// The `rows` attribute still sets the inviting starting size (height:auto
// honours it while empty), and manual vertical resize keeps working.

// Layout effect, not a plain one: the collapse-and-restore below has to
// happen before the browser paints, or the correction lands a frame late
// and the jump is visible anyway. Guarded because useLayoutEffect has no
// meaning on the server. (These composers only ever mount from a click, so
// it never runs there, but the guard costs nothing.)
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useAutoGrow(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measuring means collapsing the box for an instant, which shortens the
    // whole document. If the member is scrolled past where the page now
    // ends, the browser clamps their scroll position to the new bottom, and
    // restoring the height a line later leaves them somewhere they didn't
    // put themselves. In a tall box on desktop that reads as the view
    // yanking itself to a new spot on every keystroke. So: remember where
    // they were, measure, put them back.
    const top = window.scrollY;
    const left = window.scrollX;
    el.style.height = "auto";
    // border-box: scrollHeight covers content + padding but not the border,
    // so add it back or the box sits two pixels short and shows a scrollbar.
    const cs = getComputedStyle(el);
    const border =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + border}px`;
    // Explicitly instant: the site sets scroll-behavior: smooth globally, so
    // a plain scrollTo would animate the correction and turn an invisible
    // fix into a visible slide.
    if (window.scrollY !== top || window.scrollX !== left) {
      window.scrollTo({ top, left, behavior: "instant" });
    }
  }, [ref, value]);
}
