"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Member-area nav. Visible only on /notes/(member)/* routes via the
// (member) layout. Three items: Start Here, Field Notes, Account.
//
// Desktop (md+): vertical sticky sidebar to the left of the content
// column. Active item gets the eye-deep accent color and a left gold
// border.
//
// Mobile: horizontal sticky strip pinned to top:0. The site header
// itself is not sticky, so this pins as you scroll past the header.
// Active item gets the same accent treatment via a bottom border
// instead of left.

type NavItem = {
  href: string;
  label: string;
};

const ITEMS: NavItem[] = [
  { href: "/notes/start", label: "Start Here" },
  { href: "/notes", label: "Field Notes" },
  { href: "/notes/account", label: "Account" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/notes") {
    // Field Notes is active on the index and on individual notes
    // (/notes/[slug]) — but NOT on /notes/start or /notes/account.
    if (pathname === "/notes") return true;
    if (
      pathname.startsWith("/notes/") &&
      pathname !== "/notes/start" &&
      pathname !== "/notes/account" &&
      pathname !== "/notes/sign-in"
    ) {
      return true;
    }
    return false;
  }
  return pathname === href;
}

export function MemberNav() {
  const pathname = usePathname() ?? "";

  return (
    <>
      {/* === Mobile: sticky horizontal strip === */}
      <nav
        aria-label="Member area"
        className="md:hidden sticky top-0 z-20 bg-paper-deep/95 backdrop-blur-sm border-b border-rule"
        style={{
          // Match the site's hairline-rule aesthetic; backdrop-blur keeps
          // text legible when content scrolls behind.
        }}
      >
        <ul className="flex items-stretch justify-center max-w-3xl mx-auto px-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className={
                    "font-display uppercase tracking-[0.22em] no-underline px-4 py-3 transition-colors " +
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
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "block font-display uppercase tracking-[0.22em] no-underline py-2.5 pl-4 transition-colors " +
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
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
