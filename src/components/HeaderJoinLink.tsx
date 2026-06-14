"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The header JOIN button. It exists to send people TO the membership
// page, so it's hidden once you're already on it (/membership and its
// sub-pages: /gift, /pool, /success). There the page's own hero + sticky
// CTA carry the ask, and a header "Join" pointing at the current page is
// pure redundancy. Shown on every other route as the persistent,
// site-wide entry point.

export function HeaderJoinLink() {
  const pathname = usePathname();
  if (pathname?.startsWith("/membership")) return null;
  return (
    <Link href="/membership" className="header-subscribe">
      Join
    </Link>
  );
}
