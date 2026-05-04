import Link from "next/link";
import type { Metadata } from "next";
import { getAllLetterEditions } from "@/lib/letters";

export const metadata: Metadata = {
  title: "Letters to the Preditor",
  description:
    "The reader column of Stop Being Prey. Reader letters edited and published monthly.",
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

export default function LettersPage() {
  const editions = getAllLetterEditions();

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Reader Column</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Letters to the Preditor
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Reader letters, edited and published monthly.
          </p>
        </div>
      </section>

      {/* Intro + submit CTA */}
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="prose-article">
          <p>
            Letters to the Preditor is the reader column of Stop Being Prey.
            It runs once a month. Letters that wrestle with the doctrine,
            push back on it, extend it, or share a story it triggered are
            the ones that make it in. Edited for length and clarity,
            attributed however you choose.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link href="/letters/submit" className="btn-primary">
            <span>Submit a letter →</span>
          </Link>
        </div>
      </div>

      {/* Editions */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <p className="eyebrow mb-10 text-center">All Editions</p>
        {editions.length === 0 ? (
          <p className="text-center font-display italic text-ink-muted leading-relaxed" style={{ fontSize: "1.15rem" }}>
            Edition 1 in preparation. Submit your letter to be considered.
          </p>
        ) : (
          <ul className="space-y-10 max-w-2xl mx-auto">
            {editions.map((edition) => (
              <li key={edition.slug}>
                <p className="text-xs uppercase tracking-[0.18em] text-ink-faint mb-2">
                  Edition {edition.number} · {formatDate(edition.date)}
                </p>
                <h2
                  className="font-display text-2xl mb-2 leading-tight tracking-tight"
                  style={{ fontWeight: 700 }}
                >
                  <Link
                    href={`/letters/${edition.slug}`}
                    className="text-ink hover:text-eye-deep no-underline"
                  >
                    {edition.title}
                  </Link>
                </h2>
                {edition.description && (
                  <p className="text-ink-muted text-sm italic leading-relaxed">
                    {edition.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
