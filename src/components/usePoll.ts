"use client";

import { useEffect, useRef } from "react";

// Shared polling loop for the site-wide pollers, with the two rules that
// keep a poller from billing for nothing:
//
//   1. Never poll a hidden tab. Page Visibility, as before.
//   2. Never poll a tab nobody is using. A visible tab left open on an
//      essay over lunch used to poll every 30 seconds for hours. The
//      reader is gone; the requests are not. After IDLE_LIMIT_MS with no
//      interaction the loop goes quiet and any interaction wakes it.
//
// The timer keeps ticking through both cases and simply skips the work,
// so waking up costs nothing and needs no teardown or restart.

const IDLE_LIMIT_MS = 10 * 60_000;

// Passive, cheap, and enough to tell a reader from an abandoned tab.
const WAKE_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

export function usePoll(
  tick: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  // Kept in a ref so a caller can pass an inline closure without
  // restarting the interval on every render.
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!enabled) return;

    let lastActive = Date.now();
    const bump = () => {
      lastActive = Date.now();
    };

    function run() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActive > IDLE_LIMIT_MS) return;
      void tickRef.current();
    }

    // Returning to the tab reconciles at once instead of waiting out the
    // rest of the interval, and counts as activity in its own right.
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      bump();
      run();
    }

    for (const evt of WAKE_EVENTS) {
      window.addEventListener(evt, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(run, intervalMs);

    return () => {
      window.clearInterval(timer);
      for (const evt of WAKE_EVENTS) {
        window.removeEventListener(evt, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
