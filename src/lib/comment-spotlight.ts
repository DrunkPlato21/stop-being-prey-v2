// Finding your own comment after you post it.
//
// The comment list is coin-ranked (Comments.tsx), so a new comment does
// NOT land at the top. It lands below every comment that has earned a
// coin, in the middle of the list, while the form sits underneath the
// whole thing. The author is left staring at other people's comments with
// no sign their own posted, and the problem gets worse as more comments
// earn coins. Readers reported this as "my comment didn't save".
//
// Position can't be relied on, so nothing here guesses at it: we look up
// the comment's own anchor (CommentItem renders id="c-<id>"), scroll it
// into view, and mark it. Works wherever the ranking puts it.

/** Fired by CommentForm on a successful post; detail carries the new id. */
export const COMMENT_POSTED_EVENT = "sbp:comment-posted";

const SPOTLIGHT_CLASS = "comment-just-posted";

// How long the highlight stays up. Deliberately long: this audience does
// not scan fast, and a 2s flash they miss is the same as no flash at all.
const HOLD_MS = 12_000;

// The list is server-rendered, so after router.refresh() the new comment
// appears on a later paint. Poll for it rather than assuming it's there.
const POLL_MS = 150;
const MAX_TRIES = 40; // ~6s

// Re-aim for this long after the first scroll. The essay above the
// comments has lazy images and a Spotify embed; they settle after the
// scroll starts and drag the target out of view (measured ~490px off on
// a 390px viewport). One scroll is not enough.
const SETTLE_MS = 250;
const SETTLE_TRIES = 10;

// Landing zone: the comment's top near the top of the screen. A band,
// not a pixel, so a few px of drift doesn't trigger a pointless re-scroll.
function isLanded(el: HTMLElement): boolean {
  const top = el.getBoundingClientRect().top;
  return top >= -8 && top <= window.innerHeight * 0.5;
}

function spotlight(id: string): void {
  const at = () => document.getElementById(`c-${id}`);
  const first = at();
  if (!first) return;

  // "start", not "center". A top-level comment carries its whole reply
  // thread, so it can be far taller than the screen (measured 2099px on
  // an 844px viewport). Centering a block that tall necessarily pushes
  // its top ~590px above the fold, hiding the byline and the "Your
  // comment" badge, which are the parts that answer "did it post?".
  // "start" honours the scroll-margin-top CommentItem already sets.
  //
  // Instant, never smooth: the comments sit ~32k pixels down these
  // essays, and smooth-scrolling that far takes many seconds and reads
  // as the page running away.
  first.scrollIntoView({ block: "start" });
  first.classList.add(SPOTLIGHT_CLASS);

  // Keep re-aiming while the page settles.
  let tries = 0;
  const settle = window.setInterval(() => {
    const el = at();
    if (el && !isLanded(el)) {
      el.scrollIntoView({ block: "start" });
    }
    tries += 1;
    if (tries >= SETTLE_TRIES) window.clearInterval(settle);
  }, SETTLE_MS);

  // Hold the mark through server-component refreshes. CommentForm calls
  // router.refresh() on post and CommentsLiveRefresh calls it every 30s;
  // either reconciles the list and throws away a class set imperatively
  // on a node React owns. Re-assert it until the hold is up.
  const until = Date.now() + HOLD_MS;
  const keep = window.setInterval(() => {
    const el = at();
    if (el && !el.classList.contains(SPOTLIGHT_CLASS)) {
      el.classList.add(SPOTLIGHT_CLASS);
    }
    if (Date.now() >= until) {
      window.clearInterval(keep);
      at()?.classList.remove(SPOTLIGHT_CLASS);
    }
  }, 200);
}

/**
 * Scroll to a comment and mark it. Resolves false if it never showed up,
 * so the caller can leave its "show me" fallback on screen instead of
 * silently doing nothing.
 */
export function revealComment(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(`c-${id}`);
      if (el) {
        spotlight(id);
        resolve(true);
        return;
      }
      if (tries >= MAX_TRIES) {
        resolve(false);
        return;
      }
      tries += 1;
      window.setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

/** Announce a freshly posted comment to whatever is listening. */
export function announceCommentPosted(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(COMMENT_POSTED_EVENT, { detail: { id } })
  );
}
