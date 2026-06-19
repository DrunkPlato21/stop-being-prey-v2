import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import { getMember, getTierBadge } from "@/lib/members";
import { derivePresenceState, getPresence } from "@/lib/desk";
import { IdentityMenu, type IdentityMenuProps } from "@/components/IdentityMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { DeskPresenceIndicator } from "@/components/DeskPresenceIndicator";
import { HeaderJoinLink } from "@/components/HeaderJoinLink";
import { HeaderPublicNav } from "@/components/HeaderPublicNav";

// Three chrome states:
//   - Logged-out: presence indicator (only when Clay is active) + JOIN.
//   - Logged-in, no paid membership (churned member, dev grant): same as
//     logged-out — JOIN nudges them to (re)subscribe.
//   - Paid member (or admin author): identity dropdown + bell + presence
//     (always shown, even when away). No JOIN — redundant.
//
// "Paid member" here = admin OR member.status in {active, trialing}. Past-
// due/canceled holders of valid 30-day session JWTs still see JOIN.
//
// Identity composition:
//   - firstName: first word of display name, fallback to email local-part.
//   - role: "author" for admin, "founder" with founderSlot, "charter"
//     with charterSlot, else "member".
//   - memberSinceMs: createdAt on the member record (null for the author
//     since admins don't carry a member record).

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

type IdentityResolution = {
  identity: IdentityMenuProps;
  isPaidMember: boolean;
};

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
  const isPaidMember =
    !!member && (member.status === "active" || member.status === "trialing");

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
    isPaidMember,
  };
}

export async function Header() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // Resolve identity (when signed in) + initial desk presence in
  // parallel so the header's first paint is fully correct. The
  // presence indicator refreshes itself client-side every 30s
  // thereafter.
  const [resolution, presenceState] = await Promise.all([
    session ? resolveIdentity(session.email) : Promise.resolve(null),
    getPresence().then((p) => derivePresenceState(p)),
  ]);
  const identity = resolution?.identity ?? null;
  const isPaidMember = resolution?.isPaidMember ?? false;
  // Non-paid viewers only see the presence indicator when Clay is
  // actively at the desk — there's no value in showing "stepped away"
  // to people who can't reach him anyway. Paid members get the
  // indicator in every state.
  const showPresence = isPaidMember || presenceState === "active";

  return (
    // Stacking context for the whole header so the identity dropdown
    // sits above any page section that creates its own stacking
    // context (e.g. .rules-paper with isolation: isolate). The sticky
    // scroll bar lives outside this header (rendered by the root
    // layout) so its position:fixed isn't trapped in this context.
    <header className="relative z-50">
      {/* === Tier 1: wordmark + Subscribe / identity ===
          Thin olive rule under the chrome separates header from
          page content. Kept faint so it reads as anchoring, not
          dividing. */}
      <div
        style={{ borderBottom: "1px solid rgba(138, 125, 32, 0.32)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
          <Link
            href="/"
            className="no-underline"
            aria-label="Stop Being Prey, home"
          >
            <span
              className="font-display tracking-tight text-ink whitespace-nowrap"
              style={{
                fontWeight: 700,
                letterSpacing: "-0.015em",
                fontSize: "clamp(1.15rem, 4.5vw, 1.4rem)",
              }}
            >
              Stop Being Prey
            </span>
          </Link>

          {isPaidMember && identity ? (
            <div className="flex items-center gap-4 sm:gap-6">
              <DeskPresenceIndicator initialState={presenceState} />
              <div className="flex items-center gap-2">
                <NotificationsBell />
                <IdentityMenu {...identity} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-4">
              {showPresence && (
                <DeskPresenceIndicator
                  initialState={presenceState}
                  href="/membership"
                  hideWhenAway
                />
              )}
              {/* Quiet sign-in link for returning members on a new
                  device or after session expiry. JOIN stays the loud
                  primary CTA; this slots beside it as the secondary
                  affordance so existing members aren't forced to
                  know /notes/sign-in exists. */}
              <Link href="/notes/sign-in" className="header-signin">
                Sign in
              </Link>
              {/* Hidden on the join-flow pages where it would just point
                  at the current page; see HeaderJoinLink. */}
              <HeaderJoinLink />
            </div>
          )}
        </div>
      </div>

      {/* === Tier 2: the public site's nav strip ===
          Hidden in the member area (see HeaderPublicNav), where the
          member nav is the only nav. Membership isn't surfaced here — the
          Sign in / Join pair in Tier 1 already covers that entry point. */}
      <HeaderPublicNav />
    </header>
  );
}
