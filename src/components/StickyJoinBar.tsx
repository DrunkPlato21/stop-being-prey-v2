"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Persistent join CTA for the long membership page. Mobile only (the
// page is short enough on desktop that the hero CTA stays reachable).
// Shows only when neither real "join" control is on screen — the hero
// CTA up top or the pricing form at the bottom — so the bar never
// competes with the actual buttons. Tapping it jumps to #pricing, the
// one source of truth for the form.

export function StickyJoinBar({
  priceLabel,
  ctaLabel,
}: {
  priceLabel: string;
  ctaLabel: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Hide the bar whenever one of the page's own CTAs is in view. Keyed
    // by element so each observer callback only flips its own target.
    const targets = ["hero-cta", "pricing"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (!("IntersectionObserver" in window) || targets.length === 0) {
      // Without observers we can't tell when a CTA is on screen, so leave
      // the bar hidden rather than risk overlapping the real buttons.
      return;
    }

    const visible = new Set<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setShow(visible.size === 0);
      },
      // Count a CTA as "visible" slightly before it fully enters, so the
      // bar retracts a touch early as a real button approaches.
      { rootMargin: "0px 0px -25% 0px" }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`sticky-join${show ? " sticky-join--show" : ""}`}
      aria-hidden={!show}
    >
      <div className="sticky-join-inner">
        <span className="sticky-join-price">{priceLabel}</span>
        <Link
          href="#pricing"
          className="sticky-join-cta"
          tabIndex={show ? 0 : -1}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
