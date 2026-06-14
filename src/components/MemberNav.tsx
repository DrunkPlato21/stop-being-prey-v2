"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Member-area nav. Visible on /desk (the landing) and the /notes/*
// sub-routes that share the (member) layout. Four items: Desk (the
// landing), Rules, Field Notes, Account.
//
// Desktop (md+): vertical sticky sidebar to the left of the content
// column. Active item gets the eye-deep accent color and a left gold
// border.
//
// Mobile: horizontal sticky strip pinned to top:0. The site header
// itself is not sticky, so this pins as you scroll past the header.
//
// "New since you were last here" indicators: a small gold dot sits to
// the right of the label when the section has activity newer than the
// member's last visit. Dot state is computed server-side (see
// getNavDots) and passed in via the `dots` prop. Map keys are the
// section's href; absent or false values render no dot. The dot reuses
// var(--eye) so it sits in the same gold hue family as the rest of the
// chrome without clashing with the eye-deep active state.

type NavItem = {
  href: string;
  label: string;
  /** When true, render extra top-margin above this item on the
      desktop sidebar so it reads as the start of a new cluster.
      Mobile horizontal strip ignores this flag. */
  clusterBreak?: boolean;
};

export type MemberNavDots = Partial<Record<string, boolean>>;

// Three clusters, no dividing lines, just whitespace:
//   1. Presence layer: Desk, Lounge
//   2. Content / doctrine: Rules, Field Notes, Case Files, Book
//   3. Utility: Account
const ITEMS: NavItem[] = [
  { href: "/desk", label: "Desk" },
  { href: "/lounge", label: "Lounge" },
  { href: "/notes/rules", label: "Rules", clusterBreak: true },
  { href: "/notes/field-notes", label: "Field Notes" },
  { href: "/case-files", label: "Case Files" },
  { href: "/book", label: "Book" },
  { href: "/notes/account", label: "Account", clusterBreak: true },
  { href: "/notes/coins", label: "Your Coins" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/desk") {
    // Desk is active on /desk only. The legacy /notes path redirects
    // to /desk before this component renders, so we don't need to
    // match it here.
    return pathname === "/desk" || pathname.startsWith("/desk/");
  }
  if (href === "/notes/field-notes") {
    // Field Notes is active on the index and on any individual note
    // under /notes/field-notes/[slug].
    return (
      pathname === "/notes/field-notes" ||
      pathname.startsWith("/notes/field-notes/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberNav({ dots }: { dots?: MemberNavDots } = {}) {
  const pathname = usePathname() ?? "";
  const hasDot = (href: string): boolean => !!(dots && dots[href]);

  return (
    <>
      {/* === Mobile: sticky horizontal strip === */}
      <nav
        aria-label="Member area"
        className="md:hidden sticky top-0 z-20 bg-paper-deep/95 backdrop-blur-sm border-b border-rule"
      >
        {/* flex-wrap so the strip flows onto a second row instead of
            overflowing the page sideways. The item count outgrew the
            single-row mobile design (now 8), and on a narrow phone an
            overflowing row pushed the whole document wider — breaking
            fixed/centered overlays too. Wrapping keeps every item
            reachable and the page width pinned to the viewport. */}
        <ul className="flex flex-wrap items-stretch justify-center max-w-3xl mx-auto px-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const showDot = hasDot(item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className={
                    "font-display uppercase tracking-[0.18em] no-underline px-3 py-2.5 transition-colors " +
                    (active
                      ? "text-eye-deep"
                      : "text-ink-muted hover:text-ink")
                  }
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    borderBottom: active
                      ? "2px solid var(--eye-deep)"
                      : "2px solid transparent",
                  }}
                >
                  {item.label}
                  {showDot && (
                    <span className="nav-new-dot" aria-hidden="true" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* === Desktop: sticky vertical sidebar === */}
      <aside
        aria-label="Member area"
        className="hidden md:block md:w-[200px] md:shrink-0 md:sticky md:top-10 md:self-start md:pt-16"
      >
        <p
          className="eyebrow mb-6"
          style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
        >
          Members
        </p>
        <ul className="flex flex-col">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const showDot = hasDot(item.href);
            return (
              <li
                key={item.href}
                style={
                  item.clusterBreak ? { marginTop: "1.1rem" } : undefined
                }
              >
                <Link
                  href={item.href}
                  className={
                    "block font-display uppercase tracking-[0.22em] no-underline py-2.5 pl-4 pr-3 transition-colors " +
                    (active
                      ? "text-eye-deep"
                      : "text-ink-muted hover:text-ink")
                  }
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    borderLeft: active
                      ? "2px solid var(--eye-deep)"
                      : "2px solid var(--rule)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <span>{item.label}</span>
                  {showDot && (
                    <span className="nav-new-dot" aria-hidden="true" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Ornamental tail beneath the sidebar items. Three olive
            dots, generous tracking, decorative only. Anchors the
            nav as a contained unit and adds editorial polish. */}
        <p
          aria-hidden="true"
          className="font-display text-center select-none"
          style={{
            color: "var(--eye-deep)",
            fontSize: "1.1rem",
            letterSpacing: "0.6em",
            marginTop: "3rem",
            marginBottom: "1rem",
            // Letter-spacing on the last char pushes the visual
            // center right; nudge back so the row sits centered.
            paddingRight: "0.6em",
            opacity: 0.78,
          }}
        >
          &middot;&middot;&middot;
        </p>
      </aside>
    </>
  );
}
