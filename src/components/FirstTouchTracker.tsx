"use client";

import { useEffect } from "react";
import { channelFromReferrer } from "@/lib/channels";
import { track } from "@/lib/track";

// First-touch acquisition attribution. On a visitor's very first arrival
// (no sbp_channel cookie yet), bucket where they came from (facebook /
// google / direct ...), stash it in a 1-year cookie, and count one
// channel "view". Later — at checkout — the server reads the same cookie
// so a paid conversion is credited to the channel that originally brought
// them. Returning visitors do nothing here: first-touch stays first.
//
// Renders nothing. Mounted once in the root layout so every entry counts.

const COOKIE = "sbp_channel";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function FirstTouchTracker() {
  useEffect(() => {
    try {
      const has = document.cookie
        .split("; ")
        .some((c) => c.startsWith(`${COOKIE}=`));
      if (has) return;
      const channel = channelFromReferrer(
        document.referrer,
        window.location.search
      );
      // Not HttpOnly (set from JS) so the checkout route can read it.
      // Lax survives the off-site -> site top-level navigation.
      document.cookie = `${COOKIE}=${channel}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
      track("view", { channel });
    } catch {
      /* attribution is best-effort; never break the page */
    }
  }, []);
  return null;
}
