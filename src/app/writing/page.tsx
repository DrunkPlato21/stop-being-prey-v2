import Link from "next/link";
import type { Metadata } from "next";
import { getCornerstones, getDispatches } from "@/lib/articles";

// The writing archive, in two tempos: the major essays (cornerstones)
// and the dispatches (shorter, more frequent pieces). Replaces the old
// magazine "Issues" framing (Vol/No numbering is gone). The route stays
// /issues for now; nav + heading read "Writing".
//
// NOTE: section labels ("The major essays" / "Dispatches") are
// placeholder - Clay to name in his voice.

export const metadata: Metadata = {
  title: "Writing",
  description:
    "The writing of Stop Being Prey. Major essays and dispatches on power, politics, and the apex class by Clay.",
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
  const dispatches = getDispatches();

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
            <br />
            The long essays and the quick ones.
          </p>
        </div>
      </section>

      {/* === The major essays (cornerstones) === */}
      <section className="max-w-3xl mx-auto px-6 pt-12 md:pt-16 pb-8">
        <p className="eyebrow mb-10">The major essays</p>
        {cornerstones.length === 0 ? (
          <p className="text-center text-ink-muted italic">
            Nothing here yet. Stay close.
          </p>
        ) : (
          <ol className="space-y-10">
            {cornerstones.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/${article.slug}`}
                  className="block border-b border-rule pb-10 no-underline group"
                >
                  <p className="eyebrow mb-3">{formatDate(article.date)}</p>
                  <h2
                    className="font-display text-ink leading-tight tracking-tight mb-3 group-hover:text-eye-deep transition-colors"
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
            ))}
          </ol>
        )}
      </section>

      {/* === Dispatches (the shorter, frequent pieces) === */}
      {dispatches.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 pb-12 md:pb-16">
          <p className="eyebrow mb-6">Dispatches</p>
          <ul className="flex flex-col">
            {dispatches.map((article, idx) => (
              <li
                key={article.slug}
                className={idx > 0 ? "border-t border-rule" : undefined}
              >
                <Link
                  href={`/${article.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-6 py-4 no-underline"
                >
                  <span
                    className="font-display text-ink group-hover:text-eye-deep transition-colors leading-snug"
                    style={{ fontSize: "1.2rem", fontWeight: 600 }}
                  >
                    {article.title}
                  </span>
                  <span className="eyebrow shrink-0 whitespace-nowrap">
                    {formatDate(article.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
