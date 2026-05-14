"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Slim secondary nav that slides in once the reader has scrolled past
// the masthead. Lives only on the public marketing site; suppressed on
// member-area routes (those have their own chrome via MemberNav). Kept
// quiet — paper background at low opacity, hairline border, no shadow —
// so it reads as ambient navigation rather than a CTA banner.
//
// The right-side affordance mirrors the masthead's logic but condensed:
//   - Not signed in: Sign in (subtle) + Join (loud).
//   - Signed in, no paid membership: Join.
//   - Paid member or admin: a single quiet link back to /desk.

const SHOW_AFTER_PX = 140;

// Member-area pathnames where the sticky should stay hidden. Keep in
// sync with src/proxy.ts notesGate matcher.
const MEMBER_ROUTE_PREFIXES = [
  "/desk",
  "/lounge",
  "/book",
  "/case-files",
  "/notifications",
  "/notes",
  "/admin",
];

function isMemberRoute(pathname: string): boolean {
  return MEMBER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export type StickyNavProps = {
  signedIn: boolean;
  isPaidMember: boolean;
};

export function StickyNav({ signedIn, isPaidMember }: StickyNavProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > SHOW_AFTER_PX);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // catch refresh-mid-scroll
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isMemberRoute(pathname)) return null;

  return (
    <div
      aria-hidden={!visible}
      className="sticky-nav"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 220ms ease-out",
        backgroundColor: "rgba(245, 240, 232, 0.97)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(138, 125, 32, 0.24)",
        boxShadow: visible ? "0 1px 0 rgba(138, 125, 32, 0.04)" : "none",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 flex items-center justify-between gap-3 py-2.5 sm:py-3">
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
              fontSize: "0.98rem",
            }}
          >
            Stop Being Prey
          </span>
        </Link>

        {/* Center nav. Hidden below sm so the bar stays a single
            comfortable row on phones; the masthead's tier-2 nav is
            still available via scroll-to-top. */}
        <nav className="hidden sm:flex items-center gap-x-5 text-sm">
          <Link href="/issues" className="header-nav-link text-ink hover:text-eye-deep transition-colors no-underline">
            Issues
          </Link>
          <Link href="/podcast" className="header-nav-link text-ink hover:text-eye-deep transition-colors no-underline">
            Podcast
          </Link>
          <Link href="/about" className="header-nav-link text-ink hover:text-eye-deep transition-colors no-underline">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {isPaidMember ? (
            <Link
              href="/desk"
              className="header-signin"
              style={{ whiteSpace: "nowrap" }}
            >
              Desk &rarr;
            </Link>
          ) : signedIn ? (
            <Link href="/membership" className="header-subscribe">
              Join
            </Link>
          ) : (
            <>
              <Link
                href="/notes/sign-in"
                className="header-signin hidden sm:inline"
              >
                Sign in
              </Link>
              <Link href="/membership" className="header-subscribe">
                Join
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
