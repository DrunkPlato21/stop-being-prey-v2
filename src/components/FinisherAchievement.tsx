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
// uses) — the highest-intent moment on the page. Routes by who the reader is:
//   - member: nothing. They own the room already.
//   - non-member, not on the email list: the free-list invite, tracked as
//     sub_submit/sub_success under source "finisher".
//   - non-member, already on the list: the membership invite, cadence-capped
//     (see lib/finisher) so a regular reader isn't asked every single time.
//
// Copy is Clay's, in his voice. Each ask is split into a short italic lead
// (which nods at what the reader just did) and the body, to sit in the
// existing two-line visual. Universal across piece length/tier — the lead
// works the same on a 400-word dispatch as on a 10k-word essay.

// Cold reader (not on the list yet): get on the free list.
const COLD_LEAD = "Thanks for reading.";
const COLD_BODY =
  "I write to my list nearly every single day. I want you on it. I think it'd be good for both of us. What do you say?";

// Known subscriber (on the list, not a member): join the room.
const MEMBER_LEAD = "You read the whole thing. I appreciate that.";
const MEMBER_BODY =
  "Want to be in a group of people who read the whole thing? That's where the real discussions happen. That's where you can reach me, and watch me work.";
const ASK_CTA = "Take a seat";

type Resolved = { showAsk: boolean; subscriber: boolean };

function MembershipAsk() {
  // The CTA carries ?src=finisher to /membership; checkout_started and
  // became_member are recorded server-side (checkout route + webhook),
  // attributed to this source, so there's no client double-count.
  return (
    <div className="finisher-ask">
      <p className="finisher-ask-line">{MEMBER_BODY}</p>
      <Link
        href="/patronage?src=finisher"
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
      <p className="finisher-ask-line">{COLD_BODY}</p>
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
  // they've expressed through behavior is respected.
  if (resolved.subscriber && !resolved.showAsk) return null;

  const lead = resolved.subscriber ? MEMBER_LEAD : COLD_LEAD;

  return (
    <aside className="finisher-inline" aria-label="End of piece">
      <p className="finisher-inline-recognition">{lead}</p>
      {resolved.subscriber ? <MembershipAsk /> : <ListAsk slug={slug} />}
    </aside>
  );
}
