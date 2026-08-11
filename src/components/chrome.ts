"use client";

import { useEffect, useState } from "react";
import type { IdentityMenuProps } from "@/components/IdentityMenu";
import type { PresenceState } from "@/lib/desk";

// Shared viewer-chrome state for the header and the sticky nav.
//
// The chrome (who is this viewer, are they a paid member, is Clay at
// the desk) used to be resolved server-side in the root layout, which
// made every page in the app render per-request. Now the pages ship
// static and this hook fetches /api/chrome once per page load from the
// browser. Bots don't run JS, so bot traffic costs nothing.
//
// Two consumers mount per page (HeaderChrome + StickyNavChrome); the
// module-level promise makes sure they share ONE request. The last
// known chrome is kept in sessionStorage so a member's identity paints
// on the next page without waiting for the fetch — the fetch still
// runs and corrects it (e.g. after sign-out).

export type ChromeState = {
  signedIn: boolean;
  isPaidMember: boolean;
  identity: IdentityMenuProps | null;
  presence: PresenceState;
};

const STORAGE_KEY = "sbp:chrome";

let inflight: Promise<ChromeState | null> | null = null;

function load(): Promise<ChromeState | null> {
  if (!inflight) {
    inflight = fetch("/api/chrome", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        data && data.ok
          ? ({
              signedIn: !!data.signedIn,
              isPaidMember: !!data.isPaidMember,
              identity: data.identity ?? null,
              presence: (data.presence ?? "auto-expired") as PresenceState,
            } satisfies ChromeState)
          : null
      )
      .catch(() => null);
  }
  return inflight;
}

function readStored(): ChromeState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChromeState) : null;
  } catch {
    return null;
  }
}

/**
 * The viewer's chrome, or null while unknown. The null phase renders
 * the public (signed-out) chrome, which is also what crawlers and the
 * static HTML see.
 */
export function useChrome(): ChromeState | null {
  const [state, setState] = useState<ChromeState | null>(null);

  useEffect(() => {
    let alive = true;
    // Paint the last known chrome immediately (no flash for returning
    // members), then let the fetch confirm or correct it.
    const stored = readStored();
    if (stored) setState(stored);
    void load().then((chrome) => {
      if (!chrome) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chrome));
      } catch {}
      if (alive) setState(chrome);
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
