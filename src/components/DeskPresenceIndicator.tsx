"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PresenceState } from "@/lib/desk";

// Persistent site-wide indicator showing whether Clay is at the
// desk. Two states, two visual treatments:
//   active           → green dot with soft pulse + "Clay is at the desk"
//   manually-away
//   auto-expired     → empty olive circle + "Clay stepped away"
//
// Reads the existing /api/writers-desk/state polling endpoint so
// the indicator stays in sync with the Writer's Desk widget without
// adding a parallel data source. Polls every 30s while the tab is
// visible; pauses when hidden via Page Visibility API.
//
// Initial state is server-rendered so the first paint is correct.

const POLL_INTERVAL_MS = 30_000;

function isAtDesk(state: PresenceState): boolean {
  return state === "active";
}

function label(state: PresenceState): string {
  return isAtDesk(state) ? "Clay is at the desk" : "Clay stepped away";
}

export function DeskPresenceIndicator({
  initialState,
  href = "/desk",
  hideWhenAway = false,
}: {
  initialState: PresenceState;
  href?: string;
  /** When true (non-paid viewers), render nothing once state leaves
      "active" — they don't need to see Clay's away status. Server
      gates initial render; this gates client-side polling too. */
  hideWhenAway?: boolean;
}) {
  const [state, setState] = useState<PresenceState>(initialState);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function fetchState() {
      try {
        const res = await fetch("/api/writers-desk/state", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: { state?: PresenceState } = await res
          .json()
          .catch(() => ({}));
        if (cancelled) return;
        if (data.state) setState(data.state);
      } catch {
        // Network blips are fine — next tick recovers.
      }
    }

    function start() {
      if (document.visibilityState === "hidden") return;
      void fetchState();
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(fetchState, POLL_INTERVAL_MS);
    }
    function stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    }
    function onVis() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const atDesk = isAtDesk(state);
  if (hideWhenAway && !atDesk) return null;

  return (
    <Link
      href={href}
      className="header-presence-link"
      aria-label={label(state)}
    >
      <span
        aria-hidden="true"
        className={
          "header-presence-dot " +
          (atDesk ? "header-presence-dot-active" : "header-presence-dot-away")
        }
      />
      <span className="header-presence-text">{label(state)}</span>
    </Link>
  );
}
