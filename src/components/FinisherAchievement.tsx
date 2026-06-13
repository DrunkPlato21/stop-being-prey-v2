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
// Email-ask copy is PLACEHOLDER for Clay; the membership ASK_LINE is his
// finalized voice, carried over.

const RECOGNITION =
  "Only about half who start a piece this long finish it. You did.";

const LIST_LINE =
  "The next one can land in your inbox the day it ships. No algorithm deciding whether you see it.";

// Finalized non-member ask (Clay's voice). Shown only to readers already
// on the email list; the cadence cap in lib/finisher governs how OFTEN.
// (Em dash from the source copy swapped to periods per the no-em-dash rule.)
const ASK_LINE =
  "You read to the end. So does everyone in the room. The members-only conversation you won't find anywhere else. You just proved you belong in it. Take your seat, and you keep the whole thing alive while you're at it.";
const ASK_CTA = "Take a seat";

type Resolved = { showAsk: boolean; subscriber: boolean };

function MembershipAsk() {
  // The CTA carries ?src=finisher to /membership; checkout_started and
  // became_member are recorded server-side (checkout route + webhook),
  // attributed to this source, so there's no client double-count.
  return (
    <div className="finisher-ask">
      <p className="finisher-ask-line">{ASK_LINE}</p>
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
  regionId = "reading-region",
}: {
  slug: string;
  isMember: boolean;
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

  return (
    <aside className="finisher-inline" aria-label="End of piece">
      <p className="finisher-inline-recognition">{RECOGNITION}</p>
      {resolved.subscriber ? <MembershipAsk /> : <ListAsk slug={slug} />}
    </aside>
  );
}
