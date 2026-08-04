"use client";

import { useEffect } from "react";
import { channelFromReferrer, referrerFrom } from "@/lib/channels";
import { track } from "@/lib/track";

// Two jobs, both about where a visitor came from.
//
// First-touch attribution: on a visitor's very first arrival (no
// sbp_channel cookie yet), bucket them (facebook / google / direct ...),
// stash it in a 1-year cookie, and count one channel "view". Later — at
// checkout — the server reads the same cookie so a paid conversion is
// credited to the channel that originally brought them. Returning
// visitors do nothing here: first-touch stays first.
//
// Raw referrer: EVERY off-site arrival, first or not, also reports the
// referring host and page. That deliberately isn't first-touch. A reader
// who first found the site on Facebook and comes back six weeks later via
// a forum thread is exactly the discovery this exists to catch, and
// first-touch would hide it. Same-host referrers are dropped upstream, so
// internal navigation never counts as an arrival.
//
// Renders nothing. Mounted once in the root layout so every entry counts.

const COOKIE = "sbp_channel";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function FirstTouchTracker() {
  useEffect(() => {
    try {
      const referrer = referrerFrom(document.referrer, window.location.hostname);

      const seen = document.cookie
        .split("; ")
        .some((c) => c.startsWith(`${COOKIE}=`));

      let channel;
      if (!seen) {
        channel = channelFromReferrer(
          document.referrer,
          window.location.search
        );
        // Not HttpOnly (set from JS) so the checkout route can read it.
        // Lax survives the off-site -> site top-level navigation.
        document.cookie = `${COOKIE}=${channel}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax`;
      }

      // Nothing to say when a returning visitor arrives with no off-site
      // referrer. The beacon would write no counters anyway.
      if (!channel && !referrer) return;
      track("view", { channel, referrer });
    } catch {
      /* attribution is best-effort; never break the page */
    }
  }, []);
  return null;
}
