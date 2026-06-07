// Pure scroll-progress math, shared by the reading-progress bar and the
// scroll-depth analytics so the two always agree on "how far through the
// body the reader is."
//
// Returns 0..1 for the given region element:
//   0  when the region's top sits at (or below) the top of the viewport
//   1  when the region's bottom reaches the bottom of the viewport
// A region shorter than the viewport counts as fully read once its top
// passes the top of the viewport.

export function computeReadingProgress(el: HTMLElement): number {
  if (typeof window === "undefined") return 0;
  const rect = el.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) {
    return rect.top <= 0 ? 1 : 0;
  }
  const progress = -rect.top / scrollable;
  return Math.min(1, Math.max(0, progress));
}
