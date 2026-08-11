"use client";

import Link from "next/link";
import { useChrome } from "@/components/chrome";
import { IdentityMenu } from "@/components/IdentityMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { DeskPresenceIndicator } from "@/components/DeskPresenceIndicator";
import { HeaderJoinLink } from "@/components/HeaderJoinLink";

// The right side of the header's top tier. Three chrome states:
//   - Logged-out: presence indicator (only when Clay is active) + JOIN.
//   - Logged-in, no paid membership: same as logged-out — JOIN nudges
//     them to (re)subscribe.
//   - Paid member (or admin author): identity dropdown + bell +
//     presence (always shown, even when away). No JOIN — redundant.
//
// Rendered client-side from /api/chrome (see components/chrome.ts) so
// the pages themselves can ship static. Until the chrome resolves this
// renders the public pair, which is also what crawlers see; a returning
// member's identity paints from sessionStorage without a flash.

export function HeaderChrome() {
  const chrome = useChrome();

  if (chrome?.isPaidMember && chrome.identity) {
    return (
      <div className="flex items-center gap-4 sm:gap-6">
        <DeskPresenceIndicator initialState={chrome.presence} />
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <IdentityMenu {...chrome.identity} />
        </div>
      </div>
    );
  }

  // Non-paid viewers only see the presence indicator when Clay is
  // actively at the desk — there's no value in showing "stepped away"
  // to people who can't reach him anyway.
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {chrome?.presence === "active" && (
        <DeskPresenceIndicator
          initialState={chrome.presence}
          href="/membership?src=header"
          hideWhenAway
        />
      )}
      {/* Quiet sign-in link for returning members on a new device or
          after session expiry. JOIN stays the loud primary CTA. */}
      <Link href="/notes/sign-in" className="header-signin">
        Sign in
      </Link>
      {/* Hidden on the join-flow pages where it would just point at the
          current page; see HeaderJoinLink. */}
      <HeaderJoinLink />
    </div>
  );
}
