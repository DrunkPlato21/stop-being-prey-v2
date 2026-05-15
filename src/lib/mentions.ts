import { getEmailByDisplayName, getProfile } from "./comments";
import { listAllMemberEmails } from "./members";
import { normalizeForCheck } from "./display-name";

export { mentionTokenFor } from "./display-name";

// @-mention parsing + resolution for the lounge.
//
// Mentions are written as `@<token>` where <token> is a run of word
// characters (letters, digits, underscores). The token has to follow
// either the start of input or whitespace, so an email address
// pasted into a reply (`reach me at clay@example.com`) doesn't get
// picked up as a mention of "example".
//
// Resolution is two-pass:
//   1. Fast path: normalize the token via normalizeForCheck and look
//      it up in `displayname:taken:<normalized>`. This hits members
//      whose entire display name is a single word ("Trish", "Cheri").
//   2. Slow path: scan all members and compare the normalized first
//      word of each profile's display name to the token. Catches
//      members whose first name is shared with the start of a longer
//      display name (e.g. "Mary S." → first word "Mary"). Membership
//      is in the tens, so a full scan is fine for an async
//      notification fan-out.

// Captures `@token` where token follows whitespace or input start.
// Using a non-capturing alternation on the boundary so the capture
// group cleanly holds just the token text.
const MENTION_RE = /(?:^|\s)@(\w+)/g;

/**
 * Pull every @-mention from a body and return the unique set of
 * normalized tokens (lower-case-letters only). Preserves order of
 * first occurrence so notifications fire in the same order the
 * author wrote them, but each member is only notified once per
 * reply even if mentioned multiple times.
 */
export function parseMentions(body: string): string[] {
  if (!body) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const normalized = normalizeForCheck(m[1] ?? "");
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Best-effort lookup of `normalized` (a token already passed through
 * normalizeForCheck) to a member email. Returns null when no member
 * claims the token under either their full display name or their
 * first word.
 */
export async function resolveMentionToEmail(
  normalized: string
): Promise<string | null> {
  if (!normalized) return null;

  // Fast path — exact full-displayName claim.
  const exact = await getEmailByDisplayName(normalized);
  if (exact) return exact;

  // Slow path — first-word match across all members. We do this
  // sequentially via getProfile rather than firing dozens of parallel
  // requests; the caller is already inside a fire-and-forget
  // background block and a few hundred ms of latency doesn't matter.
  const emails = await listAllMemberEmails();
  for (const email of emails) {
    const profile = await getProfile(email).catch(() => null);
    if (!profile?.displayName) continue;
    const firstWord = profile.displayName.trim().split(/\s+/)[0] ?? "";
    if (!firstWord) continue;
    if (normalizeForCheck(firstWord) === normalized) {
      return email;
    }
  }

  return null;
}

