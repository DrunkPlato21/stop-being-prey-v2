// Lightweight email-quality guard shared by every signup path (the
// /api/subscribe route and the Rules unlock action). It is NOT verification
// — we never block a real address. It does two cheap things: a basic shape
// check, and a reject-list of the common disposable/throwaway domains so the
// instant-unlock gate doesn't fill Kit with addresses that only ever bounce.
// Determined people can still get a throwaway through; that's fine, the goal
// is to stop the lazy junk, not to wage war on it.

// The throwaway domains people actually type. Subdomains are matched too
// (foo.mailinator.com), so this list stays short. Add to it if a particular
// junk domain starts showing up in the list.
const DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "tempmail.net",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "mailnesia.com",
  "dispostable.com",
  "fakeinbox.com",
  "mintemail.com",
  "spamgourmet.com",
  "mohmal.com",
  "emailondeck.com",
  "burnermail.io",
  "mailcatch.com",
  "moakt.com",
  "tutanota.com.tempmail",
  "tmpmail.org",
  "tmpmail.net",
  "discard.email",
  "spam4.me",
  "grr.la",
  "pokemail.net",
];

// Normalize an arbitrary form/JSON value into a comparable email string:
// a string, trimmed and lowercased (so casing never splits a subscriber).
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export type EmailProblem = "format" | "disposable";

// Returns the reason an email should be rejected, or null if it looks fine.
// Expects an already-normalized (lowercased) address.
export function emailProblem(email: string): EmailProblem | null {
  // One @, something before it, and a dotted domain after it.
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email);
  if (!match) return "format";

  const domain = match[1];
  const disposable = DISPOSABLE_DOMAINS.some(
    (d) => domain === d || domain.endsWith("." + d),
  );
  if (disposable) return "disposable";

  return null;
}
