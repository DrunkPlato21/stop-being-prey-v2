import Link from "next/link";
import type { Metadata } from "next";
import { getAllWalls, type WallMeta } from "@/lib/walls";

// /walls: discovery index for the per-piece walls (Marek, etc.). The
// singular /wall is the main supporters wall; this plural route lists
// every per-piece takedown wall on file. Matches the visual language of
// /walls/[slug] (eyebrow, large serif title, italic context, hairline
// rules) so the index reads as part of the same set.

export const metadata: Metadata = {
  title: "The Walls",
  description:
    "Every per-piece wall on Stop Being Prey. Public records tied to a specific takedown.",
};

// Prefer the most purpose-built summary line available, falling back to
// the first sentence of the cold-reader intro.
function summaryLine(wall: WallMeta): string {
  if (wall.description) return wall.description;
  if (wall.context) return wall.context;
  if (wall.subtitle) return wall.subtitle;
  const firstSentence = wall.intro.split(/(?<=\.)\s/)[0] ?? "";
  return firstSentence;
}

// Active walls first, then by start date newest-first (untimed walls
// sink to the bottom of their group), then title as a stable tiebreak.
function sortWalls(walls: WallMeta[]): WallMeta[] {
  return [...walls].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    const aStart = a.startedAt ? Date.parse(a.startedAt) : 0;
    const bStart = b.startedAt ? Date.parse(b.startedAt) : 0;
    if (aStart !== bStart) return bStart - aStart;
    return a.title.localeCompare(b.title);
  });
}

export default function WallsIndexPage() {
  const walls = sortWalls(getAllWalls());

  return (
    <div>
      {/* === Hero === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-4 fade-up stagger-1">The Walls</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5.5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Every wall on the record.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Each wall is tied to a specific takedown. A public record, with
            your name on it, aimed at the person who earned it.
          </p>
        </div>
      </section>

      {/* === Index === */}
      <section className="max-w-3xl mx-auto px-6 pt-10 md:pt-14 pb-20">
        {walls.length === 0 ? (
          <p className="text-center font-serif italic text-ink-muted">
            No walls on file yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {walls.map((wall, i) => (
              <li
                key={wall.slug}
                className={
                  i === 0 ? "py-7" : "py-7 border-t border-rule"
                }
              >
                <Link
                  href={`/walls/${wall.slug}`}
                  className="group block no-underline"
                >
                  <div className="flex items-baseline justify-between gap-4 mb-2">
                    <p
                      className="eyebrow"
                      style={{
                        letterSpacing: "0.22em",
                        fontSize: "0.62rem",
                        color:
                          wall.status === "active"
                            ? "var(--eye-deep, currentColor)"
                            : undefined,
                      }}
                    >
                      {wall.status === "active" ? "Active" : "Closed"}
                    </p>
                    <span
                      className="font-display uppercase tracking-[0.22em] text-ink-faint group-hover:text-eye-deep transition-colors shrink-0"
                      style={{ fontSize: "0.62rem", fontWeight: 600 }}
                    >
                      view &rarr;
                    </span>
                  </div>
                  <h2
                    className="font-display text-ink leading-tight tracking-tight group-hover:text-eye-deep transition-colors mb-2"
                    style={{
                      fontSize: "clamp(1.5rem, 3vw, 2rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {wall.title}
                  </h2>
                  <p className="font-serif text-ink-muted leading-relaxed">
                    {summaryLine(wall)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/wall"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            the supporters wall &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
