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
        {/* Three-column row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 mb-12">
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

          {/* Read & Listen */}
          <div>
            <p className={columnHeaderClass} style={columnHeaderStyle}>
              Read & Listen
            </p>
            <ul className="space-y-2">
              <li>
                <Link href="/essays" className={navLinkClass}>
                  Essays
                </Link>
              </li>
              <li>
                <Link href="/podcast" className={navLinkClass}>
                  Podcast
                </Link>
              </li>
              <li>
                <Link href="/about" className={navLinkClass}>
                  About
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
            </ul>
          </div>
        </div>

        {/* Colophon band — framed by hairlines top and bottom */}
        <div className="border-t border-b border-rule py-3 text-center">
          <span className="eyebrow" style={{ letterSpacing: "0.18em" }}>
            Independent · Uncompromised · Without paywalls · Reader-supported
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
