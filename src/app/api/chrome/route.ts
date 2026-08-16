import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  WHO_COOKIE,
  verifySession,
  whoCookieOptions,
} from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  getMember,
  getTierBadge,
  hasLiveSeat,
  isInDunning,
} from "@/lib/members";
import { derivePresenceState, getPresence } from "@/lib/desk";
import type { IdentityMenuProps } from "@/components/IdentityMenu";

// GET /api/chrome
//
// One request that resolves everything the site chrome (header +
// sticky nav) needs to know about the viewer: session identity, paid
// standing, and desk presence. This used to be resolved server-side
// inside the root layout on EVERY page render, which made every route
// in the app dynamic — so each of a scraper's ~36k daily hits paid for
// a full server render (see the 2026-08-10 scraper incident). Now the
// public pages are static and only real browsers make this one call.
//
// Anonymous viewers get { signedIn: false } plus presence, which the
// header needs to decide whether to show "Clay is at the desk".

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

type IdentityResolution = {
  identity: IdentityMenuProps;
  isPaidMember: boolean;
  /** Mid-failed-renewal. Separate from isPaidMember on purpose: the seat
      isn't live, but this is still a member the chrome must treat as
      one. See HeaderChrome. */
  billingIssue: boolean;
};

// Identity composition mirrors what the header always showed:
//   - firstName: first word of display name, fallback to email local-part.
//   - role: "author" for admin, "founder"/"charter" with a slot, else
//     "member". Admin counts as paid for chrome purposes.
//   - "Paid member" = admin OR a live seat (active/trialing).
async function resolveIdentity(email: string): Promise<IdentityResolution> {
  const adminUser = isAdmin(email);
  const fallbackName = email.split("@")[0] || email;

  if (adminUser) {
    const profile = await getProfile(email).catch(() => null);
    const displayName = profile?.displayName || fallbackName;
    return {
      identity: {
        firstName: firstWord(displayName) || fallbackName,
        displayName,
        email,
        role: "author",
        founderSlot: null,
        charterSlot: null,
        tierBadge: null,
        memberSinceMs: null,
        avatarUrl: null,
      },
      isPaidMember: true,
      billingIssue: false,
    };
  }

  const [profile, member] = await Promise.all([
    getProfile(email).catch(() => null),
    getMember(email).catch(() => null),
  ]);

  const displayName = profile?.displayName || fallbackName;
  const role: IdentityMenuProps["role"] =
    member?.tier === "founder" && typeof member.founderSlot === "number"
      ? "founder"
      : member?.tier === "charter" && typeof member.charterSlot === "number"
        ? "charter"
        : "member";

  return {
    identity: {
      firstName: firstWord(displayName) || fallbackName,
      displayName,
      email,
      role,
      founderSlot:
        member?.tier === "founder" && typeof member.founderSlot === "number"
          ? member.founderSlot
          : null,
      charterSlot:
        member?.tier === "charter" && typeof member.charterSlot === "number"
          ? member.charterSlot
          : null,
      tierBadge: getTierBadge(member),
      memberSinceMs:
        typeof member?.createdAt === "number" ? member.createdAt : null,
      avatarUrl: member?.customAvatarUrl ?? null,
    },
    isPaidMember: hasLiveSeat(member),
    billingIssue: isInDunning(member),
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  const [resolution, presence] = await Promise.all([
    session ? resolveIdentity(session.email) : Promise.resolve(null),
    getPresence()
      .then((p) => derivePresenceState(p))
      .catch(() => "auto-expired" as const),
  ]);

  // Sort this browser for next time: members keep calling /api/chrome,
  // confirmed-anonymous browsers switch to the CDN-cached /api/presence
  // (see components/chrome.ts). Refreshing "m" on every call keeps the
  // marker alive alongside the rolling session.
  cookieStore.set(WHO_COOKIE, session ? "m" : "a", whoCookieOptions());

  return Response.json(
    {
      ok: true,
      signedIn: !!session,
      isPaidMember: resolution?.isPaidMember ?? false,
      billingIssue: resolution?.billingIssue ?? false,
      identity: resolution?.identity ?? null,
      presence,
    },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
