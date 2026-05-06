import Link from "next/link";
import type { Metadata } from "next";
import { getAllArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Essays",
  description:
    "Every issue of Stop Being Prey, in order. Long-form essays on politics, power, and the apex class by Clay.",
};

export default function EssaysPage() {
  const issues = getAllArticles()
    .filter((a) => typeof a.issue === "number")
    .sort((a, b) => (b.issue ?? 0) - (a.issue ?? 0));

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

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
            Essays
          </h1>
          <p className="font-serif italic text-ink-muted text-lg md:text-xl max-w-xl mx-auto leading-relaxed fade-up stagger-3">
            Every issue, in order. Newest first.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {issues.length === 0 ? (
          <p className="text-center text-ink-muted italic">
            No issues yet. Stay close.
          </p>
        ) : (
          <ol className="space-y-10">
            {issues.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/${article.slug}`}
                  className="block border-b border-rule pb-10 no-underline group"
                >
                  <p className="eyebrow mb-3">
                    Issue No. {article.issue} · {formatDate(article.date)}
                  </p>
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

        <div className="mt-16 text-center">
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← Back home
          </Link>
        </div>
      </section>
    </div>
  );
}
