// Client-only "is this browser a known list subscriber" flag. Set when
// an email signup succeeds anywhere on the site; read by surfaces that
// route their ask (email list for cold readers, membership for readers
// already on the list). Same localStorage ethos as lib/finisher:
// cookieless, no PII (the flag is a bare "1", never the address),
// per-browser. False negatives are fine — a subscriber on a new device
// just sees the email form again, and Kit dedupes the re-submit.

const STORAGE_KEY = "sbp.subscribed.v1";

export function markSubscribed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode / quota — degrades to "always show the email ask" */
  }
}

export function isKnownSubscriber(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
