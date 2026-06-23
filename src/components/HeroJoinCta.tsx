"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isKnownSubscriber } from "@/lib/subscribed";

// The hero's second CTA, shown only to readers already on the list. A cold
// stranger gets one job (read the rules); someone who's already given their
// email gets the next step (join the room). The subscribed flag lives in
// localStorage, so it's unreadable at SSR — we render nothing until mount,
// then reveal for known subscribers. False negatives (new device, private
// mode) just see the single primary CTA, which is the safe default.

export function HeroJoinCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isKnownSubscriber()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <Link href="/membership" className="btn-secondary">
      Join the room
    </Link>
  );
}
