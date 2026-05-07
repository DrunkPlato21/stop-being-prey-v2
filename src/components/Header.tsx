import Link from "next/link";

const navLinkClass =
  "header-nav-link text-ink hover:text-eye-deep transition-colors no-underline";

export function Header() {
  return (
    <header>
      {/* === Tier 1: wordmark + Subscribe === */}
      <div className="border-b border-rule">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-4">
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
                fontSize: "clamp(1.15rem, 4.5vw, 1.4rem)",
              }}
            >
              Stop Being Prey
            </span>
          </Link>
          <Link href="/#join" className="header-subscribe">
            Subscribe
          </Link>
        </div>
      </div>

      {/* === Tier 2: slim nav strip === */}
      <nav className="border-b border-rule bg-paper-deep/40">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-7 gap-y-1 py-2.5 sm:py-3">
          <Link href="/issues" className={navLinkClass}>
            Issues
          </Link>
          <span className="header-nav-sep" aria-hidden="true">
            ·
          </span>
          <Link href="/podcast" className={navLinkClass}>
            Podcast
          </Link>
          <span className="header-nav-sep" aria-hidden="true">
            ·
          </span>
          <Link href="/membership" className={navLinkClass}>
            Membership
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
          <Link href="/tip" className={navLinkClass}>
            Tip
          </Link>
        </div>
      </nav>
    </header>
  );
}
