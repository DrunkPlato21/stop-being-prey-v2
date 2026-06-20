"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { computeReadingProgress } from "@/lib/reading-progress";
import { registerFinish } from "@/lib/finisher";
import { isKnownSubscriber } from "@/lib/subscribed";
import { track } from "@/lib/track";
import { EmailSignup } from "@/components/EmailSignup";

// End-of-read capture. Mounts NOTHING until the reader genuinely reaches
// the end of #reading-region (the same scroll_100 signal ReadingTracker
// uses) — the highest-intent moment on the page. No toast, no badge, no
// "achievement" theatrics: 2,318 gamified membership asks produced 2
// checkout clicks and 0 members, so the block now matches the page's
// register and routes by who the reader is:
//   - member: nothing. They own the room already.
//   - non-member, not on the email list: the free-list form (the proven
//     converter for cold readers), tracked as sub_submit/sub_success
//     under source "finisher".
//   - non-member, already on the list: the membership ask, still
//     cadence-capped (see lib/finisher).
//
// Both asks (email-list and membership) carry PLACEHOLDER copy that Clay
// plans to revisit alongside the /membership rewrite.

// Recognition line (the lead-in above the ask). Two problems with the old
// single line ("...a piece this long...You did."): it read canned because
// it was identical everywhere, and it was false on a short dispatch (not
// "this long"). So it now (1) branches on tier - cornerstones get the
// earned completion flattery, dispatches pivot to depth instead - and
// (2) varies within each tier by a stable per-slug pick, so no two pieces
// say the same thing and Clay writes nothing per piece. PLACEHOLDER copy.
const CORNERSTONE_RECOGNITION = [
  "Less than half who start a piece this long finish it. You did.",
  "Most people bail on something this long. You read the whole argument.",
  "A piece this long filters for serious people. You're still here.",
];

const DISPATCH_RECOGNITION = [
  "Short one. The full argument lives in the long essays, and the room.",
  "If that landed, it's not the half of it.",
  "That's the quick version. There's a whole doctrine behind it.",
];

// Stable pick: same slug always shows the same line, different slugs vary.
// No Math.random (keeps SSR/CSR in agreement and the choice deterministic).
function pickBySlug(pool: string[], slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return pool[h % pool.length];
}

const LIST_LINE =
  "The next one can land in your inbox the day it ships. No algorithm deciding whether you see it.";

// Membership ask shown to finishers already on the email list (cadence-
// capped in lib/finisher). PLACEHOLDER pending the /membership rewrite.
// Rewritten away from the old "serious people like you / you already
// belong" flattery, which read as a move to an audience trained to spot
// moves. Now: an identity-contrast opener (the MEMBERSHIP_OPENER above
// the body), the reason-why (reader-funded, so it can tell the truth),
// and a takeaway close instead of a beg.
const MEMBERSHIP_OPENER =
  "Reading this makes you informed. The room makes you hard to beat.";
const ASK_LINES = [
  "No advertisers, no donor class, nobody I have to keep happy. That's the only reason this is the one place I say the whole thing out loud. The case files, the arguments, me in the thread daily.",
  "Stay a spectator on the free list if you want. No hard feelings.",
];
const ASK_CTA = "Take a seat";

type Resolved = { showAsk: boolean; subscriber: boolean };

function MembershipAsk() {
  // The CTA carries ?src=finisher to /membership; checkout_started and
  // became_member are recorded server-side (checkout route + webhook),
  // attributed to this source, so there's no client double-count.
  return (
    <div className="finisher-ask">
      {ASK_LINES.map((line) => (
        <p key={line} className="finisher-ask-line">
          {line}
        </p>
      ))}
      <Link
        href="/membership?src=finisher"
        className="btn-primary finisher-ask-cta"
      >
        <span>{ASK_CTA}</span>
      </Link>
    </div>
  );
}

function ListAsk({ slug }: { slug: string }) {
  return (
    <div className="finisher-ask">
      <p className="finisher-ask-line">{LIST_LINE}</p>
      <EmailSignup source="finisher" slug={slug} />
    </div>
  );
}

export function FinisherAchievement({
  slug,
  isMember,
  isCornerstone = false,
  regionId = "reading-region",
}: {
  slug: string;
  isMember: boolean;
  isCornerstone?: boolean;
  regionId?: string;
}) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    // Members get no block at all; don't even watch the scroll.
    if (isMember) return;

    const region = document.getElementById(regionId);
    if (!region) return;

    let ticking = false;
    const cleanup = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    const finish = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      const subscriber = isKnownSubscriber();
      const r = registerFinish(slug, subscriber);
      // Count each distinct piece once: a refresh re-finish still shows
      // the block (stable), but shouldn't inflate the funnel.
      // achievement_shown = "the end-of-read block rendered", the
      // denominator for both ask flavors.
      if (r.firstFinish) {
        track("achievement_shown", { slug });
        if (subscriber && r.showAsk) {
          track("ask_shown", { slug, source: "finisher" });
        }
      }
      setResolved({ showAsk: r.showAsk, subscriber });
      cleanup();
    };

    const evaluate = () => {
      ticking = false;
      if (computeReadingProgress(region) >= 1) finish();
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Evaluate once: a very short piece may already be fully read.
    evaluate();

    return cleanup;
  }, [slug, isMember, regionId]);

  if (isMember || !resolved) return null;

  // A subscriber outside the ask cadence gets nothing — the quiet "no"
  // they've expressed through behavior is respected, same as before.
  if (resolved.subscriber && !resolved.showAsk) return null;

  // Subscribers (the membership ask) get the identity-contrast opener;
  // cold readers (the free-list ask) get the tier-varied finish line.
  const recognition = resolved.subscriber
    ? MEMBERSHIP_OPENER
    : pickBySlug(
        isCornerstone ? CORNERSTONE_RECOGNITION : DISPATCH_RECOGNITION,
        slug
      );

  return (
    <aside className="finisher-inline" aria-label="End of piece">
      <p className="finisher-inline-recognition">{recognition}</p>
      {resolved.subscriber ? <MembershipAsk /> : <ListAsk slug={slug} />}
    </aside>
  );
}
