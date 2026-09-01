"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The header JOIN button. It exists to send people TO the patronage
// page, so it's hidden once you're already on it. Three routes render
// that page (/patronage, /membership, /support-donate) and the
// /membership sub-pages (/gift, /pool, /success) carry their own ask, so
// all of them suppress it. A header "Join" pointing at the page you are
// already reading is pure redundancy. Shown on every other route as the
// persistent, site-wide entry point.

const SUPPRESS_ON = ["/patronage", "/membership", "/support-donate"];

export function HeaderJoinLink() {
  const pathname = usePathname();
  if (SUPPRESS_ON.some((p) => pathname?.startsWith(p))) return null;
  return (
    // prefetch={false}: this button is in the viewport on every page and
    // /patronage is force-dynamic, so the default prefetched a full
    // render of the patronage page for every reader who never clicked it.
    <Link href="/patronage?src=header" className="header-subscribe" prefetch={false}>
      Join
    </Link>
  );
}
