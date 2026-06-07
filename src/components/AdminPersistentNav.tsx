"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AdminNavBadges,
  NavBadgeSection,
} from "@/lib/admin-nav-badges";

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
//
// `badges` flags unread state per section — see lib/admin-nav-badges.
// Dot is hidden on the active item itself (you can't be "unread" on a
// page you're currently looking at).

type NavItem = { href: string; label: string; badgeSection?: NavBadgeSection };

const PRIMARY: NavItem[] = [
  { href: "/admin/desk", label: "Desk" },
  { href: "/admin/channels", label: "Elsewhere" },
  { href: "/admin/desk/voice", label: "Voice memos" },
  { href: "/admin/field-notes", label: "Field notes" },
  { href: "/admin/early-access", label: "Early access" },
  { href: "/admin/lounge", label: "Lounge", badgeSection: "lounge" },
  { href: "/admin/comments", label: "Comments", badgeSection: "comments" },
];

const SECONDARY: NavItem[] = [
  {
    href: "/admin/case-submissions",
    label: "Case submissions",
    badgeSection: "case-submissions",
  },
  { href: "/admin/lounge/moderation", label: "Lounge log" },
  { href: "/admin/book", label: "Book" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/sign-in-links", label: "Sign-in links" },
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
  badges,
}: {
  items: NavItem[];
  activeHref: string | null;
  isMobile: boolean;
  badges: AdminNavBadges;
}) {
  return (
    <ul
      className="admin-persistent-nav-row"
      style={isMobile ? { columnGap: "1.1rem" } : undefined}
    >
      {items.map((item, idx) => {
        const active = item.href === activeHref;
        const showBadge =
          !!item.badgeSection && !active && badges[item.badgeSection];
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
              {showBadge && (
                <span
                  aria-label="New activity since you last looked"
                  className="admin-nav-unread-dot"
                />
              )}
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

const EMPTY_BADGES: AdminNavBadges = {
  comments: false,
  lounge: false,
  "case-submissions": false,
};

export function AdminPersistentNav({
  badges: initialBadges = EMPTY_BADGES,
}: {
  /** Server-rendered first paint. Replaced on every pathname change by
      a client-side fetch of /api/admin/nav-badges — see below. */
  badges?: AdminNavBadges;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname);
  const isMobile = useIsMobile();

  // All /admin/* pages share one layout, and Next.js 16 reuses that
  // layout's RSC payload across sibling navigations (per its docs:
  // "shared layouts won't automatically be refetched on every
  // navigation, only the page segment that changes"). If we trust the
  // layout's badges prop, visiting /admin/lounge bumps the seen marker
  // in Redis but the next /admin/desk render serves the cached layout
  // with the dot still on. router.refresh() didn't help because each
  // route segment combination keeps its own cache entry. Fix: fetch
  // badges client-side on every pathname change. One request per admin
  // nav; admin is one user, so the cost is negligible.
  const [badges, setBadges] = useState<AdminNavBadges>(initialBadges);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/nav-badges", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AdminNavBadges | null) => {
        if (!cancelled && data) setBadges(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav aria-label="Admin sections" className="admin-persistent-nav">
      <div className="admin-persistent-nav-inner">
        <NavRow
          items={PRIMARY}
          activeHref={activeHref}
          isMobile={isMobile}
          badges={badges}
        />
        <NavRow
          items={SECONDARY}
          activeHref={activeHref}
          isMobile={isMobile}
          badges={badges}
        />
      </div>
    </nav>
  );
}
