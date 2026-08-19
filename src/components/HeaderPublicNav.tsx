"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The public site's nav strip (Writing / About / Tip). Hidden in
// the member area, where the member sidebar/strip is the only nav — so
// each context shows exactly one nav instead of two stacked on top of
// each other. The wordmark still returns to the public site.
//
// Member-area routes are the ones that render the member nav via their
// own layout: desk, lounge, guild, notes/*, book, case-files.
//
// /rules is the exception: it's a PUBLIC page (the doctrine front door),
// but it stays focused — no public strip, no member nav for strangers,
// just the rules + a Join CTA. Signed-in members get the member sidebar
// via /rules' own layout. Either way the public strip is suppressed.

const MEMBER_PREFIXES = [
  "/desk",
  "/lounge",
  "/guild",
  "/notes",
  "/book",
  "/case-files",
  "/arena",
  "/rules",
];

const navLinkClass =
  "header-nav-link text-ink hover:text-eye-deep transition-colors no-underline";

export function HeaderPublicNav() {
  const pathname = usePathname() ?? "";
  const inMemberArea = MEMBER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (inMemberArea) return null;

  return (
    <nav className="border-b border-rule bg-paper-deep/40">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-7 gap-y-1 py-2.5 sm:py-3">
        <Link href="/writing" className={navLinkClass}>
          Writing
        </Link>
        <span className="header-nav-sep" aria-hidden="true">
          ·
        </span>
        <Link href="/rules" className={navLinkClass}>
          Rules
        </Link>
        <span className="header-nav-sep" aria-hidden="true">
          ·
        </span>
        <Link href="/about" className={navLinkClass}>
          About
        </Link>
        <span className="header-nav-sep" aria-hidden="true">
          ·
        </span>
        <Link href="/wall" className={navLinkClass}>
          Wall
        </Link>
      </div>
    </nav>
  );
}
