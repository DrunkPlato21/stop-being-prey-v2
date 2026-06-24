import Link from "next/link";
import type { Metadata } from "next";
import { getCornerstones, readingMinutes } from "@/lib/articles";

// The writing archive. Opens with a "Start Here" pair (the two founding
// pieces, which live outside the articles system, so they're hardcoded
// below), then one "The Essays" list of every cornerstone, date-sorted.
// Replaces the old magazine "Issues" framing (Vol/No numbering is gone)
// and the former second "Dispatches" tier. Route, nav, and heading all
// read "Writing"; the old /issues 301-redirects here (proxy).

export const metadata: Metadata = {
  title: "Writing",
  description:
    "The writing of Stop Being Prey. Major essays and dispatches on power, politics, and the apex class by Clay.",
};

// The founding pieces are JSX pages under /founding, not articles. Their
// decks are pulled verbatim from the DECK constant in each founding page.
// Numbered I / II because they're meant to be read in order, as the door in.
const FOUNDING = [
  {
    numeral: "I",
    title: "Predator or Prey",
    href: "/founding/predator-or-prey",
    deck: "The founding piece of Stop Being Prey. Written seven months after Charlie Kirk was killed.",
  },
  {
    numeral: "II",
    title: "We Pray For Our Prey",
    href: "/founding/we-pray-for-our-prey",
    deck: "The grace dimension of the predator/prey doctrine. Written the morning after Easter.",
  },
];

// Section headers: the global `.eyebrow` (0.7rem) is too small to scan for
// an older audience, so these two labels keep the eyebrow's brand styling
// (cormorant, uppercase, olive, tracked) but bump the size locally. Scoped
// here on purpose — the global class is untouched so other pages are safe.
const sectionLabel = {
  fontSize: "1.05rem",
  letterSpacing: "0.24em",
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export default function EssaysPage() {
  const cornerstones = getCornerstones();

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">The archive</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Writing
          </h1>
          <p className="font-serif italic text-ink-muted text-lg md:text-xl max-w-xl mx-auto leading-relaxed fade-up stagger-3">
            On power, politics, and the apex class.
          </p>
        </div>
      </section>

      {/* === Start Here: the two founding pieces, the entry point ===
          Elevated above the essay list: a short olive beat, a larger
          label, Roman-numeral order marks in olive, and bigger titles. */}
      <section className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-12 md:pb-16">
        <span
          aria-hidden="true"
          className="block mb-6"
          style={{
            width: "2.5rem",
            height: "2px",
            background: "var(--eye-deep)",
          }}
        />
        <p className="eyebrow mb-10" style={sectionLabel}>
          Start Here
        </p>
        <ol className="space-y-12 md:space-y-14">
          {FOUNDING.map((piece) => (
            <li key={piece.href}>
              <Link
                href={piece.href}
                className="block border-b border-rule pb-10 no-underline group"
              >
                <p
                  className="font-display mb-3"
                  style={{
                    color: "var(--eye-deep)",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                  }}
                >
                  {piece.numeral}
                </p>
                <h2
                  className="font-display text-ink leading-tight tracking-tight mb-3 group-hover:text-eye-deep group-hover:translate-x-1.5 transition-all duration-300 ease-out"
                  style={{
                    fontSize: "clamp(2.1rem, 4.5vw, 3rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.024em",
                  }}
                >
                  {piece.title}
                </h2>
                <p className="font-serif italic text-ink-muted text-base md:text-lg leading-relaxed">
                  {piece.deck}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* === The Essays (all cornerstones, date-sorted) === */}
      <section className="max-w-3xl mx-auto px-6 pb-12 md:pb-16">
        <p className="eyebrow mb-10" style={sectionLabel}>
          The Essays
        </p>
        {cornerstones.length === 0 ? (
          <p className="text-center text-ink-muted italic">
            Nothing here yet. Stay close.
          </p>
        ) : (
          <ol className="space-y-10">
            {cornerstones.map((article) => {
              const mins = readingMinutes(article);
              return (
                <li key={article.slug}>
                  <Link
                    href={`/${article.slug}`}
                    className="block border-b border-rule pb-10 no-underline group"
                  >
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="eyebrow">{formatDate(article.date)}</span>
                      {mins != null && (
                        <span
                          className="font-serif text-ink-faint"
                          style={{ fontSize: "0.78rem" }}
                        >
                          {mins} min read
                        </span>
                      )}
                    </div>
                    <h2
                      className="font-display text-ink leading-tight tracking-tight mb-3 group-hover:text-eye-deep group-hover:translate-x-1.5 transition-all duration-300 ease-out"
                      style={{
                        fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                        fontWeight: 700,
                        letterSpacing: "-0.022em",
                      }}
                    >
                      {article.title}
                    </h2>
                    <p className="font-serif italic text-ink-muted text-base md:text-lg leading-relaxed">
                      {article.subtitle ?? article.description}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← Back home
        </Link>
      </section>
    </div>
  );
}
