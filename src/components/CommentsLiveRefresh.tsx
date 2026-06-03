"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keeps the server-rendered comments fresh without a manual reload.
//
// Comments are a server component: only the person who just posted got a
// router.refresh() (see ReplyCommentForm / CommentForm). Everyone else
// saw a frozen snapshot from page-load time, so members received "X
// replied to your comment" notifications (the bell polls live) for
// replies their open page never showed — and following the notification
// is a soft client navigation that can serve Next's cached route
// segment, so even that didn't always reveal them.
//
// This brings comments to the same liveness the lounge has: poll
// router.refresh() while the tab is visible, and refresh on refocus.
// router.refresh() refetches the route's server components while
// preserving client state, so an in-progress reply draft survives. We
// skip a tick while a comment textarea/input is focused so a refresh
// never lands mid-typing. Renders nothing.

const REFRESH_INTERVAL_MS = 30_000;

export function CommentsLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "TEXTAREA" ||
        tag === "INPUT" ||
        (el as HTMLElement).isContentEditable === true
      );
    }

    function refreshIfIdle() {
      if (document.visibilityState !== "visible") return;
      if (isTyping()) return;
      router.refresh();
    }

    const timer = window.setInterval(refreshIfIdle, REFRESH_INTERVAL_MS);
    // Coming back to the tab (e.g. after tapping a reply notification in
    // another tab) should reconcile immediately, not wait for the tick.
    document.addEventListener("visibilitychange", refreshIfIdle);
    window.addEventListener("focus", refreshIfIdle);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfIdle);
      window.removeEventListener("focus", refreshIfIdle);
    };
  }, [router]);

  return null;
}
