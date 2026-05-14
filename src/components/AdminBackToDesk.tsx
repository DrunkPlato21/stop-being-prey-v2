"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Fixed top-left "Desk" pill rendered on every admin page EXCEPT
// /admin/desk itself (where it would be a confusing back-to-self
// link). Mirrors the dark-mode toggle's top-right anchor so the two
// pieces of admin chrome live symmetrically in the PWA window.
//
// Uses usePathname() to suppress on the desk; works with Next.js
// app-router segments so visiting /admin/desk/voice still hides the
// pill (we're inside the desk's scope, the user knows where they are).

export function AdminBackToDesk() {
  const pathname = usePathname();
  if (
    pathname === "/admin/desk" ||
    pathname?.startsWith("/admin/desk/")
  ) {
    return null;
  }

  return (
    <div className="admin-back-anchor">
      <Link href="/admin/desk" className="admin-back-link">
        <span aria-hidden="true" style={{ marginRight: "0.45rem" }}>
          &larr;
        </span>
        Desk
      </Link>
    </div>
  );
}
