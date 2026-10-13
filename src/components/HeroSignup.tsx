"use client";

import { useEffect, useState } from "react";
import { EmailSignup } from "@/components/EmailSignup";
import { isKnownSubscriber, markSubscribed } from "@/lib/subscribed";

// The homepage's above-the-fold email ask (Settle: the list is the job, so
// a cold stranger is asked first, not after the whole page). Hidden for
// anyone we can tell is already in:
//   - signed-in members: the sbp_who=m marker cookie (lib/auth WHO_COOKIE)
//   - list subscribers: the localStorage flag set by any successful signup
//     (lib/subscribed)
//   - readers arriving from a Kit email link carrying ck_subscriber_id,
//     which we also remember via markSubscribed so later visits stay quiet
// Renders nothing until mount (both signals are client-only), so nobody
// already on the list ever sees a flash of the form. False negatives (new
// device, private mode) just see the ask again; Kit dedupes.

function isSignedInMember(): boolean {
  try {
    return /(?:^|;\s*)sbp_who=m(?:;|$)/.test(document.cookie);
  } catch {
    // Sandboxed contexts can deny cookie access; treat as not signed in.
    return false;
  }
}

export function HeroSignup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("ck_subscriber_id")) {
      markSubscribed();
    }
    if (!isSignedInMember() && !isKnownSubscriber()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="max-w-xl mx-auto mt-10 fade-up stagger-3">
      <p className="font-serif text-ink text-lg md:text-xl leading-relaxed mb-3">
        I write an email almost every day about power&hellip; who has it, who
        doesn&rsquo;t, and why being right was never enough.
      </p>
      <p className="font-serif italic text-ink-muted text-base md:text-lg mb-6">
        If you&rsquo;re comfortable losing politely, this isn&rsquo;t for you.
      </p>
      <div className="flex justify-center">
        <EmailSignup source="hero" submitLabel="I'm in" />
      </div>
    </div>
  );
}
