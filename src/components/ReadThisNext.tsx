import Link from "next/link";

// End-of-essay recirculation. A quiet, editorial "here's another one"
// block at the exit of an article — keeps an engaged reader on the site
// (more pageviews, more chances at the email asks) instead of bouncing.
// Sits below the conversion CTA so it never competes with it. Renders
// nothing when there's nothing to recommend.

export type NextRead = {
  slug: string;
  title: string;
  description: string;
};

export function ReadThisNext({ items }: { items: NextRead[] }) {
  if (items.length === 0) return null;
  return (
    <section className="max-w-3xl mx-auto px-6 py-12 md:py-16 border-t border-rule">
      <p className="eyebrow mb-8 text-center">Read this next</p>
      <ul className="flex flex-col gap-8 md:gap-10 max-w-2xl mx-auto">
        {items.map((a) => (
          <li key={a.slug}>
            <Link href={`/${a.slug}`} className="group block no-underline">
              <h3
                className="font-display text-ink leading-tight tracking-tight group-hover:text-eye-deep transition-colors mb-2"
                style={{
                  fontSize: "clamp(1.4rem, 3vw, 1.9rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {a.title}
              </h3>
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
  );
}
