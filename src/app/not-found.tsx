import Link from "next/link";
import { getAllArticles } from "@/lib/articles";

// Branded 404. Renders inside the root layout (nav + footer), so a lost
// visitor lands somewhere that still feels like the site instead of a bare
// error. Catches both the notFound() the [slug] route throws for unknown
// slugs and any unmatched route. Doubles as a recovery surface: a few
// recent essays to pull a wrong turn back into the work. getAllArticles
// degrades to [] if the content dir isn't bundled, so the suggestions just
// drop out rather than erroring.

export default function NotFound() {
  const picks = getAllArticles().slice(0, 3);

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-14 text-center">
          <p className="eyebrow mb-6">404 &middot; off the trail</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            You wandered off.
          </h1>
          <p className="deck max-w-xl mx-auto mb-10">
            This page doesn&apos;t exist, or it never did. No shame in a wrong
            turn. The work is back this way.
          </p>
          <Link href="/" className="btn-primary">
            <span>Back to the work</span>
          </Link>
        </div>
      </section>

      {picks.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 py-14 md:py-16">
          <p className="eyebrow mb-8 text-center">Or start with one of these</p>
          <ul className="flex flex-col gap-8 max-w-2xl mx-auto">
            {picks.map((a) => (
              <li key={a.slug}>
                <Link href={`/${a.slug}`} className="group block no-underline">
                  <h2
                    className="font-display text-ink leading-tight tracking-tight group-hover:text-eye-deep transition-colors mb-2"
                    style={{
                      fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {a.title}
                  </h2>
                  <p
                    className="font-serif text-ink-muted leading-relaxed"
                    style={{ fontSize: "1rem" }}
                  >
                    {a.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
