import Link from "next/link";
import type { Metadata } from "next";
import { canonicalFor } from "@/lib/seo";
import { getAllWalls } from "@/lib/walls";
import { getWallStats, isStorageConfigured } from "@/lib/wallDonations";

// The trophy room: every Predator Wall, newest first, with what readers
// raised on it. Walls never close, so each card is also a live way in.

const WALLS_DESCRIPTION =
  "Every time a hater shows up, readers answer by funding the work. Every wall stays open.";

export const metadata: Metadata = {
  title: "The Walls",
  description: WALLS_DESCRIPTION,
  alternates: canonicalFor("/walls"),
  openGraph: {
    url: "/walls",
    title: "The Walls · Stop Being Prey",
    description: WALLS_DESCRIPTION,
    type: "website",
  },
};

export const dynamic = "force-dynamic";

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function formatStarted(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function WallsPage() {
  const storageReady = isStorageConfigured();
  const walls = getAllWalls().sort((a, b) =>
    (b.startedAt ?? "").localeCompare(a.startedAt ?? "")
  );

  const rows = await Promise.all(
    walls.map(async (wall) => ({
      wall,
      stats: storageReady
        ? await getWallStats(wall.slug).catch(() => null)
        : null,
    }))
  );

  const totalCents = rows.reduce(
    (sum, r) => sum + (r.stats?.totalRaisedCents ?? 0),
    0
  );
  const totalBackers = rows.reduce(
    (sum, r) => sum + (r.stats?.donorCount ?? 0),
    0
  );

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Predator Walls</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            The Walls
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            {WALLS_DESCRIPTION}
          </p>
          {storageReady && totalCents > 0 && (
            <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mt-8 fade-up stagger-4">
              {formatMoney(totalCents)} raised · {totalBackers}{" "}
              {totalBackers === 1 ? "backer" : "backers"} · {walls.length}{" "}
              {walls.length === 1 ? "wall" : "walls"}
            </p>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        {walls.length === 0 ? (
          <p className="text-center italic text-ink-muted">No walls yet.</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {rows.map(({ wall, stats }) => {
              const started = formatStarted(wall.startedAt);
              return (
                <li key={wall.slug}>
                  <Link
                    href={`/walls/${wall.slug}`}
                    className="block border border-ink/10 bg-surface p-6 md:p-8 no-underline hover:border-eye-deep transition-colors"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-3">
                      <h2
                        className="font-display text-ink leading-tight"
                        style={{
                          fontSize: "clamp(1.5rem, 3vw, 2rem)",
                          fontWeight: 700,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {wall.title}
                      </h2>
                      {stats && (
                        <p className="font-display text-eye-deep text-xl md:text-2xl font-bold">
                          {formatMoney(stats.totalRaisedCents)}
                          <span className="text-xs uppercase tracking-[0.16em] text-ink-faint font-normal ml-2">
                            {stats.donorCount}{" "}
                            {stats.donorCount === 1 ? "backer" : "backers"}
                          </span>
                        </p>
                      )}
                    </div>
                    {wall.subtitle && (
                      <p className="font-display italic text-ink-muted mb-3">
                        {wall.subtitle}
                      </p>
                    )}
                    <p className="font-serif text-ink-muted leading-relaxed mb-4">
                      {wall.description ?? wall.intro.split(/(?<=\.)\s/)[0]}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {started && (
                        <p className="text-xs uppercase tracking-[0.14em] text-ink-faint">
                          {started}
                        </p>
                      )}
                      <p className="eyebrow text-eye-deep">Add your note →</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
