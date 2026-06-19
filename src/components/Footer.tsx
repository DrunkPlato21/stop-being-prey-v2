import Link from "next/link";

const columnHeaderClass = "font-display uppercase text-ink-muted mb-4";
const columnHeaderStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  letterSpacing: "0.22em",
  fontWeight: 600,
};

const navLinkClass =
  "text-ink hover:text-eye-deep no-underline font-serif text-sm transition-colors";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer>
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 border-t border-rule">
        {/* Brand on top (full width on mobile, 1 of 4 columns on md+).
            Below that, three nav columns (Read / Support / Elsewhere).
            Support is its own column so the funding model stays
            visible in the footer instead of being buried in Read. */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-12">
          {/* Brand */}
          <div>
            <Link href="/" className="no-underline inline-block mb-3">
              <span
                className="font-display text-ink"
                style={{
                  fontSize: "clamp(1.5rem, 2.5vw, 1.875rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.1,
                }}
              >
                Stop Being Prey
              </span>
            </Link>
            <p className="text-sm italic text-ink-muted leading-relaxed max-w-xs">
              An independent publication. Written and read aloud by Clay.
            </p>
          </div>

          {/* Nav columns. 3-col grid on mobile, merges into the outer
              4-col grid on md via display:contents */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-0 md:contents">
            {/* Read */}
            <div>
              <p className={columnHeaderClass} style={columnHeaderStyle}>
                Read
              </p>
              <ul className="space-y-2">
                <li>
                  <Link href="/issues" className={navLinkClass}>
                    Issues
                  </Link>
                </li>
                <li>
                  <Link href="/about" className={navLinkClass}>
                    About
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <p className={columnHeaderClass} style={columnHeaderStyle}>
                Support
              </p>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/membership"
                    className="text-eye-deep hover:text-ink no-underline font-serif text-sm transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    Membership
                  </Link>
                </li>
                <li>
                  <Link href="/#join" className={navLinkClass}>
                    Subscribe
                  </Link>
                </li>
                <li>
                  <Link href="/tip" className={navLinkClass}>
                    Tip
                  </Link>
                </li>
                <li>
                  <Link href="/supporters" className={navLinkClass}>
                    Supporters
                  </Link>
                </li>
              </ul>
            </div>

            {/* Elsewhere */}
            <div>
              <p className={columnHeaderClass} style={columnHeaderStyle}>
                Elsewhere
              </p>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://twitter.com/stopbeingprey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={navLinkClass}
                  >
                    Twitter / X
                  </a>
                </li>
                <li>
                  <a
                    href="https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={navLinkClass}
                  >
                    Spotify
                  </a>
                </li>
                <li>
                  <a
                    href="https://facebook.com/ThomasSowellQuotes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={navLinkClass}
                  >
                    Facebook
                  </a>
                </li>
                <li>
                  <a href="/feed.xml" className={navLinkClass}>
                    RSS
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Colophon band, framed by hairlines top and bottom */}
        <div className="border-t border-b border-rule py-3 text-center">
          <span className="eyebrow" style={{ letterSpacing: "0.18em" }}>
            Independent · Uncompromised · Reader-supported
          </span>
        </div>

        {/* Copyright */}
        <p className="text-xs italic text-ink-muted mt-6 text-center">
          © {year} Clay. All writing original.
        </p>
      </div>
    </footer>
  );
}
