import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-rule">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-6">
        <Link
          href="/"
          className="flex items-center gap-3 no-underline group"
          aria-label="Stop Being Prey, home"
        >
          <span
            className="font-display text-xl tracking-tight text-ink"
            style={{ fontWeight: 700, letterSpacing: "-0.015em" }}
          >
            Stop Being Prey
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/podcast"
            className="text-ink hover:text-eye-deep transition-colors no-underline px-3 py-2 font-display text-sm tracking-wider"
            style={{ fontWeight: 500 }}
          >
            Podcast
          </Link>
          <Link
            href="/about"
            className="text-ink hover:text-eye-deep transition-colors no-underline px-3 py-2 font-display text-sm tracking-wider"
            style={{ fontWeight: 500 }}
          >
            About
          </Link>
          <Link
            href="/#join"
            className="btn-primary ml-2"
          >
            <span>Subscribe</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
