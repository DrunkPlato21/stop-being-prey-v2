"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Persistent admin nav, rendered once from the admin layout so every
// /admin/* surface gets the same utility rail at the top. Quiet small
// caps, middle-dot separators, an olive underline on the current page.
// Replaces both the inline "Jump to" block that lived on the desk page
// and the floating back-to-desk pill — Desk leads the row and serves
// the same homing function.
//
// Two rows by priority — same visual register so the split reads as
// frequency, not category. Top row is the day-to-day surfaces Clay
// opens most; bottom row is everything else.

type NavItem = { href: string; label: string };

const PRIMARY: NavItem[] = [
  { href: "/admin/desk", label: "Desk" },
  { href: "/admin/channels", label: "Elsewhere" },
  { href: "/admin/desk/voice", label: "Voice memos" },
  { href: "/admin/lounge", label: "Lounge" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/presence", label: "Presence" },
];

const SECONDARY: NavItem[] = [
  { href: "/admin/case-submissions", label: "Case submissions" },
  { href: "/admin/lounge/moderation", label: "Lounge log" },
  { href: "/admin/book", label: "Book" },
  { href: "/admin/members", label: "Members" },
];

const ALL_ITEMS: NavItem[] = [...PRIMARY, ...SECONDARY];

// Resolve the active item by longest-prefix match so /admin/desk/voice
// highlights "Voice memos" rather than "Desk", and /admin/lounge/moderation
// highlights "Lounge log" rather than "Lounge".
function resolveActiveHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: { href: string; len: number } | null = null;
  for (const item of ALL_ITEMS) {
    const matches =
      pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && (!best || item.href.length > best.len)) {
      best = { href: item.href, len: item.href.length };
    }
  }
  return best?.href ?? null;
}

function NavRow({
  items,
  activeHref,
  isMobile,
}: {
  items: NavItem[];
  activeHref: string | null;
  isMobile: boolean;
}) {
  return (
    <ul
      className="admin-persistent-nav-row"
      style={isMobile ? { columnGap: "1.1rem" } : undefined}
    >
      {items.map((item, idx) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href} className="admin-persistent-nav-cell">
            {idx > 0 && !isMobile && (
              <span
                className="admin-persistent-nav-dot"
                aria-hidden="true"
              >
                &middot;
              </span>
            )}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "admin-persistent-nav-link" + (active ? " is-active" : "")
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Track the narrow-viewport state so the nav can drop its inline
    middle-dot separators on mobile (where they'd leave stray leading
    dots on every wrapped line). Initialised to `false` to match SSR;
    flips post-mount if matchMedia says we're under the breakpoint. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function AdminPersistentNav() {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname);
  const isMobile = useIsMobile();

  return (
    <nav aria-label="Admin sections" className="admin-persistent-nav">
      <div className="admin-persistent-nav-inner">
        <NavRow
          items={PRIMARY}
          activeHref={activeHref}
          isMobile={isMobile}
        />
        <NavRow
          items={SECONDARY}
          activeHref={activeHref}
          isMobile={isMobile}
        />
      </div>
    </nav>
  );
}
