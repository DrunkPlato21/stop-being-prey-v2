"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Persistent join CTA for the long membership page. Mobile only (the
// page is short enough on desktop that the hero CTA stays reachable).
// Slides up once the reader scrolls past the hero, and steps aside
// whenever the real pricing form is on screen so the two never compete.
// Tapping it jumps to #pricing — one source of truth for the form.

export function StickyJoinBar({
  priceLabel,
  ctaLabel,
}: {
  priceLabel: string;
  ctaLabel: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const pricing = document.getElementById("pricing");
    let pastThreshold = false;
    let pricingVisible = false;

    const update = () => setShow(pastThreshold && !pricingVisible);

    const onScroll = () => {
      // Roughly one screen down — past the masthead's own CTA.
      pastThreshold = window.scrollY > 640;
      update();
    };

    let observer: IntersectionObserver | null = null;
    if (pricing && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          pricingVisible = entries.some((e) => e.isIntersecting);
          update();
        },
        // Count the pricing block as "visible" slightly before it fully
        // enters, so the bar retracts as the form arrives.
        { rootMargin: "0px 0px -25% 0px" }
      );
      observer.observe(pricing);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
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
