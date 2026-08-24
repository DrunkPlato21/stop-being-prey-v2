"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Keeps an open bout live in the room without a manual reload.
//
// The Arena's stance is workshop, not colosseum: no sockets, no live
// counters, nothing that turns a fight into a scoreboard. But a member
// who opened the page at tile two and is still sitting there at tile
// six was reading a frozen page, and the one thing in the room that
// actually moves is the one thing that never refreshed itself.
//
// So: a heartbeat, not a stream. Every few seconds (visible tabs only)
// this asks /api/arena/pulse for the bout's version marker, one cheap
// Redis read. Only when that number has moved does it call
// router.refresh(), which refetches the route's server components and
// brings in the new tiles while preserving client state, so a
// half-typed whisper survives. A quiet bout costs one small request per
// tick; a busy one re-renders once per change rather than once per tick.
//
// Sealed cases don't render this. A filed case is a finished document.

const PULSE_INTERVAL_MS = 12_000;

export function BoutLiveRefresh({
  boutId,
  version,
}: {
  boutId: string;
  version: number;
}) {
  const router = useRouter();
  // The server hands us a fresh version on every render, so keep the
  // comparison pointed at the newest one rather than the one that was
  // current when the effect first ran.
  const seen = useRef(version);
  seen.current = version;

  useEffect(() => {
    let cancelled = false;

    // Arm the arrival glow: tiles already on the page settle silently,
    // and only nodes inserted AFTER this point (a refresh pulling in a
    // fresh tile) run the ember animation. CSS keys on the pairing of
    // .live-armed + :not([data-settled]), so the initial render never
    // flashes and an arrived tile glows exactly once.
    const room = document.querySelector(".arena-tiles");
    if (room) {
      room
        .querySelectorAll(".arena-tile")
        .forEach((el) => el.setAttribute("data-settled", ""));
      room.classList.add("live-armed");
    }

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

    async function check() {
      if (document.visibilityState !== "visible") return;
      // Never land a refresh in the middle of a whisper, or under Clay
      // mid-tile at the bench.
      if (isTyping()) return;
      try {
        const res = await fetch(
          `/api/arena/pulse?bout=${encodeURIComponent(boutId)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { v?: number };
        if (typeof data.v !== "number") return;
        if (data.v !== seen.current) {
          seen.current = data.v;
          router.refresh();
        }
      } catch {
        // Offline, or the tab is being torn down. The next tick tries
        // again; a missed beat is never worth an error in the room.
      }
    }

    const timer = window.setInterval(() => void check(), PULSE_INTERVAL_MS);
    // Coming back to the tab should reconcile at once, not wait a tick.
    const onWake = () => void check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [boutId, router]);

  return null;
}
