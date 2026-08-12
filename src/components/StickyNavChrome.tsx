"use client";

import { useChrome } from "@/components/chrome";
import { StickyNav } from "@/components/StickyNav";

// Client wrapper for the sticky scroll bar. Replaces the old
// StickyNavServer, which resolved session + paid standing with
// cookies() in the root layout and thereby made every page in the app
// dynamic. Until the chrome resolves it renders the signed-out bar,
// which is also the correct static/crawler view. Rendered by the root
// layout (not Header), so the bar's position:fixed isn't trapped
// inside Header's stacking context.

export function StickyNavChrome() {
  const chrome = useChrome();
  return (
    <StickyNav
      signedIn={!!chrome?.signedIn}
      isPaidMember={!!chrome?.isPaidMember}
      billingIssue={!!chrome?.billingIssue}
    />
  );
}
