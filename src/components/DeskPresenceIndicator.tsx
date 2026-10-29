"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PresenceState } from "@/lib/desk";
import { usePoll } from "@/components/usePoll";

// Persistent site-wide indicator showing whether Clay is at the
// desk. Two states, two visual treatments:
//   active           → green dot with soft pulse + "Clay is at the desk"
//   manually-away
//   auto-expired     → empty olive circle + "Clay stepped away"
//
// Reads /api/presence: desk state only, no cookies, no identity, and
// the same derivePresenceState() answer the Writer's Desk widget shows,
// so the two stay in sync without a parallel data source. It used to
// poll /api/writers-desk/state, which is session-aware and no-store, so
// this header dot woke a function and read Redis every 30 seconds for
// every visitor including signed-out ones. That walked straight past
// the CDN-cached endpoint the chrome already uses for exactly this
// reason (see components/chrome.ts). Same dot, mostly cache hits now.
//
// Polls every 30s while the tab is visible and in use; pauses when
// hidden or idle (see usePoll).
//
// Initial state is server-rendered so the first paint is correct.

const POLL_INTERVAL_MS = 30_000;

function isAtDesk(state: PresenceState): boolean {
  return state === "active";
}

function label(state: PresenceState): string {
  return isAtDesk(state) ? "Clay is at the desk" : "Clay stepped away";
}

// When Clay flips his own status at the desk, every tab in his browser
// should show it at once, not after a poll lands on a CDN-cached answer.
// A BroadcastChannel reaches his other tabs; the window event reaches the
// tab he clicked in (a channel doesn't echo to its sender). No server.
const CHANNEL = "sbp-presence";

export function announcePresence(state: PresenceState) {
  window.dispatchEvent(new CustomEvent<PresenceState>(CHANNEL, { detail: state }));
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(state);
    bc.close();
  } catch {
    // Older browsers without BroadcastChannel just wait for the poll.
  }
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
  const atDesk = isAtDesk(state);

  // The header first paints from sessionStorage, then the live chrome
  // arrives with the real state. useState alone kept the first (stale)
  // value until a poll happened to land, which is why the dot often
  // needed a full refresh to catch up. Follow the prop when it changes.
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const onLocal = (e: Event) => {
      const next = (e as CustomEvent<PresenceState>).detail;
      if (next) setState(next);
    };
    window.addEventListener(CHANNEL, onLocal);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e: MessageEvent<PresenceState>) => {
        if (e.data) setState(e.data);
      };
    } catch {
      bc = null;
    }
    return () => {
      window.removeEventListener(CHANNEL, onLocal);
      bc?.close();
    };
  }, []);

  // Once a non-paid viewer's dot has gone away it is never drawn again,
  // so polling on for the rest of the session is spend with nothing on
  // the other end. The prop comment above claimed this already happened.
  // The render did return null, but the effect kept running, which is
  // the quietest kind of waste there is. Now the loop actually stops. A
  // page load picks Clay back up when he returns.
  const shouldPoll = !(hideWhenAway && !atDesk);

  usePoll(
    async () => {
      try {
        const res = await fetch("/api/presence");
        if (!res.ok) return;
        const data: { presence?: PresenceState } = await res
          .json()
          .catch(() => ({}));
        if (data.presence) setState(data.presence);
      } catch {
        // Network blips are fine. The next tick recovers.
      }
    },
    POLL_INTERVAL_MS,
    shouldPoll
  );

  if (hideWhenAway && !atDesk) return null;

  return (
    <Link
      href={href}
      className="header-presence-link"
      aria-label={label(state)}
      prefetch={false}
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
