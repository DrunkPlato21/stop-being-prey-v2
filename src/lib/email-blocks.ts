import { setDigestUnsubscribed } from "./digest";
import { recordSignInFailure } from "./signin-failures";

// Resend keeps ONE suppression list for the whole account. An address on
// it is silently skipped for every send, sign-in links included, and the
// API still reports the send as accepted. So a member who once hit
// "report spam" on the Sunday digest could never get a sign-in link
// again, and the sign-in page told them to check their inbox anyway
// (fowlergriffin@yahoo.com, locked out July to September 2026).
//
// Checked on every sign-in request, before a link is minted:
//   - not on the list: carry on.
//   - a member blocked by a spam complaint: they meant "stop the
//     digest". Take them off it, lift the block, send the link they
//     just asked for.
//   - anything else (a hard bounce, a block Clay added by hand, a
//     non-member): still blocked. The caller says so on screen instead
//     of promising an email that will never come.
//
// Fails open: if Resend can't be asked, treat the address as clear and
// send as before. Lifting a block only happens in production, since dev
// shares the live Resend key.

const RESEND = "https://api.resend.com/suppressions";
const TIMEOUT_MS = 3000;

export type SignInBlock =
  | { blocked: false }
  | { blocked: true; origin: string };

export async function resolveSignInBlock(
  email: string,
  opts: { member: boolean }
): Promise<SignInBlock> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { blocked: false };
  const url = `${RESEND}/${encodeURIComponent(email)}`;
  const headers = { Authorization: `Bearer ${key}` };

  let origin: string;
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { blocked: false };
    if (!res.ok) {
      console.error(`[email-blocks] lookup ${res.status} for ${email}`);
      return { blocked: false };
    }
    const body = (await res.json()) as { origin?: string };
    origin = body.origin ?? "unknown";
  } catch (err) {
    console.error("[email-blocks] lookup failed:", err);
    return { blocked: false };
  }

  const canLift =
    opts.member &&
    origin === "complaint" &&
    process.env.NODE_ENV === "production";
  if (!canLift) return { blocked: true, origin };

  try {
    // Digest first: if the block comes off but the digest stays on, the
    // next Sunday puts it straight back.
    await setDigestUnsubscribed(email, true);
    const res = await fetch(url, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[email-blocks] lift ${res.status} for ${email}`);
      return { blocked: true, origin };
    }
  } catch (err) {
    console.error("[email-blocks] lift failed:", err);
    return { blocked: true, origin };
  }

  await recordSignInFailure({
    kind: "unblocked",
    email,
    detail: "blocked after a spam complaint; taken off the digest and unblocked",
  });
  return { blocked: false };
}
