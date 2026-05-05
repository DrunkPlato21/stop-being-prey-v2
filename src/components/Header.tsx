import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-rule">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          className="flex items-center gap-3 no-underline group"
          aria-label="Stop Being Prey, home"
        >
          <span
            className="font-display tracking-tight text-ink whitespace-nowrap"
            style={{
              fontWeight: 700,
              letterSpacing: "-0.015em",
              fontSize: "clamp(0.95rem, 3.5vw, 1.25rem)",
            }}
          >
            Stop Being Prey
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/podcast"
            className="text-ink hover:text-eye-deep transition-colors no-underline px-2 sm:px-3 py-2 font-display text-xs sm:text-sm tracking-wider"
            style={{ fontWeight: 500 }}
          >
            Podcast
          </Link>
          <Link
            href="/about"
            className="text-ink hover:text-eye-deep transition-colors no-underline px-2 sm:px-3 py-2 font-display text-xs sm:text-sm tracking-wider"
            style={{ fontWeight: 500 }}
          >
            About
          </Link>
          <Link
            href="/#join"
            className="btn-primary ml-1 sm:ml-2 !px-3 !py-2 sm:!px-6 sm:!py-[0.85rem] !text-[0.65rem] sm:!text-[0.78rem]"
          >
            <span>Subscribe</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
