"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useChrome } from "@/components/chrome";
import { usePoll } from "@/components/usePoll";

// Keeps the server-rendered comments fresh without a manual reload.
//
// Comments are a server component: only the person who just posted got a
// router.refresh() (see ReplyCommentForm / CommentForm). Everyone else
// saw a frozen snapshot from page-load time, so members received "X
// replied to your comment" notifications (the bell polls live) for
// replies their open page never showed, and following the notification
// is a soft client navigation that can serve Next's cached route
// segment, so even that didn't always reveal them.
//
// Two things this deliberately no longer does, both of them cost:
//
//   Signed-out readers don't poll at all. This exists so a member sees a
//   reply land while reading; a passing stranger will almost never be on
//   the page at the moment a comment arrives, and gets a fresh render on
//   their next page load anyway. Most traffic here is signed out, so
//   most of the cost was being spent on the case that needed it least.
//
//   A tick no longer calls router.refresh() blind. An article route is
//   dynamic, so every one of those was a full server render of the page,
//   twice a minute per open tab, almost always producing byte-identical
//   HTML. Now a tick asks /api/comments/pulse, which is one ZRANGE and
//   CDN-cached, and re-renders only when the answer has moved.
//
// Liveness for members is unchanged: same 30 second cadence, same
// refresh on refocus, still skipped while a comment box has focus so a
// refresh never lands mid-typing. router.refresh() refetches the route's
// server components while preserving client state, so an in-progress
// reply draft survives. Renders nothing.

const POLL_INTERVAL_MS = 30_000;

export function CommentsLiveRefresh() {
  const router = useRouter();
  const chrome = useChrome();
  // Null until the chrome resolves, which reads as signed out. The first
  // tick is a whole interval away, and by then it has answered.
  const signedIn = !!chrome?.signedIn;

  // The newest activity this tab has already rendered. Null means the
  // first pulse hasn't answered yet: adopt whatever it says rather than
  // treating a site that has ever had a comment as news.
  const seenAt = useRef<number | null>(null);

  usePoll(
    async () => {
      const el = document.activeElement;
      const typing =
        !!el &&
        (el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT" ||
          (el as HTMLElement).isContentEditable === true);
      if (typing) return;

      try {
        const res = await fetch("/api/comments/pulse");
        if (!res.ok) return;
        const data: { at?: number } = await res.json().catch(() => ({}));
        const at = typeof data.at === "number" ? data.at : 0;
        if (seenAt.current === null) {
          seenAt.current = at;
          return;
        }
        if (at > seenAt.current) {
          seenAt.current = at;
          router.refresh();
        }
      } catch {
        // Network blips are fine. The next tick recovers.
      }
    },
    POLL_INTERVAL_MS,
    signedIn
  );

  return null;
}
