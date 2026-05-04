import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-rule mt-32">
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6">
          {/* Brand block */}
          <div>
            <Link
              href="/"
              className="flex items-center gap-3 no-underline mb-3"
            >
              <span
                className="font-display text-lg text-ink"
                style={{ fontWeight: 700 }}
              >
                Stop Being Prey
              </span>
            </Link>
            <p className="text-sm italic text-ink-muted leading-relaxed max-w-xs">
              Politics, power, and predator/prey dynamics in 2026. Written and
              read aloud by Clay.
            </p>
          </div>

          {/* Read */}
          <div>
            <p className="eyebrow mb-4">Read & Listen</p>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-ink hover:text-eye-deep no-underline font-serif text-sm">
                  Essays
                </Link>
              </li>
              <li>
                <Link href="/podcast" className="text-ink hover:text-eye-deep no-underline font-serif text-sm">
                  Podcast
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-ink hover:text-eye-deep no-underline font-serif text-sm">
                  About
                </Link>
              </li>
              <li>
                <Link href="/#join" className="text-ink hover:text-eye-deep no-underline font-serif text-sm">
                  Subscribe
                </Link>
              </li>
              <li>
                <Link href="/tip" className="text-ink hover:text-eye-deep no-underline font-serif text-sm">
                  Tip
                </Link>
              </li>
            </ul>
          </div>

          {/* Elsewhere */}
          <div>
            <p className="eyebrow mb-4">Elsewhere</p>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://twitter.com/stopbeingprey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink hover:text-eye-deep no-underline font-serif text-sm"
                >
                  Twitter / X
                </a>
              </li>
              <li>
                <a
                  href="https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink hover:text-eye-deep no-underline font-serif text-sm"
                >
                  Spotify
                </a>
              </li>
              <li>
                <a
                  href="https://facebook.com/ThomasSowellQuotes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink hover:text-eye-deep no-underline font-serif text-sm"
                >
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-ink-faint italic">
          <span>© {year} Clay. All writing original.</span>
          <span>No ads. No sponsors. No paywalls.</span>
        </div>
      </div>
    </footer>
  );
}
