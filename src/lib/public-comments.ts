import { revalidateTag } from "next/cache";

// The signed-out comment sheet on a published essay is prerendered with
// the page (Comments viewer="public"), so a new comment has to knock the
// cached copy out or strangers would read a stale thread until the timer
// ran out. Every comment write calls revalidatePublicComments() after it
// lands. The tag sits on the cached Redis read, and Next carries a data
// tag up to every page that rendered with it, so expiring it re-renders
// each essay on its next visit.
//
// One tag for every thread on purpose: half the write routes only know a
// comment id, and an essay re-render is cheap next to a stale reply. The
// next visit after a write renders fresh (expire: 0, no stale copy), so a
// reply-notification link to #r-<id> finds its anchor even when the
// member opens it signed out.

export const PUBLIC_COMMENTS_TAG = "comments-public";

/** Backstop for writes that can't reach this deployment's cache: the
    localhost admin queue and scripts write the same Redis, but their
    revalidate lands on localhost. Matches the essay page's revalidate. */
export const PUBLIC_COMMENTS_REVALIDATE_SECONDS = 600;

export function revalidatePublicComments(): void {
  try {
    revalidateTag(PUBLIC_COMMENTS_TAG, { expire: 0 });
  } catch (err) {
    // Never fail a write over the cache. The timer above catches up.
    console.error("[comments] revalidate public cache failed:", err);
  }
}
