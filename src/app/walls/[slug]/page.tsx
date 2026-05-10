import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllWallSlugs, getWallBySlug } from "@/lib/walls";
import {
  displayName,
  getWallStats,
  isStorageConfigured,
  listApprovedByWall,
} from "@/lib/wallDonations";
import { WallDonateCard } from "@/components/WallDonateCard";

type PageParams = { slug: string };

export async function generateStaticParams() {
  return getAllWallSlugs().map((slug) => ({ slug }));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wall = await getWallBySlug(slug);
  if (!wall) return {};
  return {
    title: wall.title,
    description: wall.intro,
  };
}

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ExternalLinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block ml-1 -mt-px align-middle"
    >
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export default async function WallPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const wall = await getWallBySlug(slug);
  if (!wall) notFound();

  const storageReady = isStorageConfigured();
  const [donations, stats] = storageReady
    ? await Promise.all([listApprovedByWall(slug), getWallStats(slug)])
    : [[], { totalRaisedCents: 0, donorCount: 0, topDonor: null }];

  return (
    <div>
      {/* === Compact hero === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-8 md:pt-20 pb-6 md:pb-8 text-center">
          <p className="eyebrow mb-4 fade-up stagger-1">Predator Wall</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-3 fade-up stagger-2"
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            {wall.title}
          </h1>
          {wall.context && (
            <p className="text-sm text-ink-muted italic fade-up stagger-3">
              {wall.facebookUrl ? (
                <a
                  href={wall.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-eye-deep transition-colors"
                >
                  {wall.context}
                  <ExternalLinkIcon />
                </a>
              ) : (
                wall.context
              )}
            </p>
          )}
        </div>
      </section>

      {/* === Takedown drawer (collapsed by default, sits right below
           the hero so the takedown is the first thing offered to the
           reader). === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6">
          <details className="wall-takedown-details">
            <summary className="wall-takedown-summary">
              <span>Read the full takedown</span>
              <span className="wall-takedown-chevron" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="mt-6 mb-8">
              {wall.subtitle && (
                <p className="font-display italic text-ink-muted text-center mb-8 text-lg">
                  {wall.subtitle}
                </p>
              )}
              <div
                className="prose-article"
                dangerouslySetInnerHTML={{ __html: wall.takedownHtml }}
              />
            </div>
          </details>
        </div>
      </section>

      {/* === The Wall === */}
      <section className="max-w-3xl mx-auto px-6 pt-6 md:pt-10 pb-16">
        {/* Total raised — large and prominent. Includes optional goal
            text and a thin gold progress bar when wall.goalDollars is set. */}
        <div className="text-center mb-8">
          <p
            className="font-display text-ink mb-1"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {formatMoney(stats.totalRaisedCents)}
            {wall.goalDollars && (
              <span
                className="text-ink-faint font-display"
                style={{ fontSize: "0.55em", fontWeight: 500 }}
              >
                {" "}of ${wall.goalDollars}
              </span>
            )}
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mt-2">
            raised · {stats.donorCount}{" "}
            {stats.donorCount === 1 ? "backer" : "backers"}
          </p>
          {wall.goalDollars && (
            <div
              className="w-full max-w-sm mx-auto h-1 bg-rule mt-4"
              role="progressbar"
              aria-valuenow={Math.min(
                100,
                Math.round(
                  (stats.totalRaisedCents / 100 / wall.goalDollars) * 100
                )
              )}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-eye-deep transition-[width] duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (stats.totalRaisedCents / 100 / wall.goalDollars) * 100
                  )}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Pre-form context line — visible above the fold on mobile so
            the donor sees "what this wall is about" before the form. */}
        {wall.donateContext && wall.status === "active" && (
          <p className="max-w-xl mx-auto text-sm md:text-base italic text-ink-muted leading-relaxed text-center mb-6 md:mb-8 px-2">
            {wall.donateContext}
          </p>
        )}

        {/* Donate form */}
        {wall.status === "active" ? (
          <div className="max-w-xl mx-auto mb-12">
            {(wall.donateOverline || wall.donateHeading || wall.donateSubtitle) && (
              <div className="text-center mb-6">
                {wall.donateOverline && (
                  <p className="eyebrow mb-3">{wall.donateOverline}</p>
                )}
                {wall.donateHeading && (
                  <h2
                    className="font-display text-ink leading-[1.05] tracking-tight mb-3"
                    style={{
                      fontSize: "clamp(1.5rem, 3vw, 2rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {wall.donateHeading}
                  </h2>
                )}
                {wall.donateSubtitle && (
                  <p className="deck max-w-lg mx-auto">
                    {wall.donateSubtitle}
                  </p>
                )}
              </div>
            )}
            <div className="bg-surface border border-ink/10 p-6 md:p-8">
              <WallDonateCard
                wallSlug={wall.slug}
                noteGuidelines={wall.noteGuidelines}
                urgencyLine={wall.urgencyLine}
              />
            </div>
          </div>
        ) : (
          <p className="text-center italic text-ink-muted mb-12">
            This wall is closed to new donations.
          </p>
        )}

        {/* Top donor — moved below the form so the form sits above the
            fold on mobile. Still surfaces as social proof before the
            recent-notes wall. */}
        {stats.topDonor && (
          <div className="border-2 border-eye bg-eye/5 p-6 mb-8 relative max-w-xl mx-auto">
            <span className="absolute -top-3 left-6 bg-paper px-3 eyebrow text-eye-deep">
              Top backer
            </span>
            <p className="font-display text-lg text-ink mb-2">
              {displayName(stats.topDonor)}
              {stats.topDonor.showAmount && (
                <span className="text-eye-deep ml-2">
                  · {formatMoney(stats.topDonor.amountCents)}
                </span>
              )}
            </p>
            <p className="font-serif italic text-ink-muted leading-relaxed">
              &ldquo;{stats.topDonor.note}&rdquo;
            </p>
          </div>
        )}

        {/* Recent notes */}
        {!storageReady && (
          <p className="text-center italic text-ink-muted">
            Wall storage not yet configured.
          </p>
        )}

        {storageReady && donations.length === 0 && (
          <p className="text-center italic text-ink-muted">
            No notes on the wall yet. Be the first.
          </p>
        )}

        {donations.length > 0 && (
          <>
            <p className="eyebrow text-center mb-6">Recent notes</p>
            <ul className="flex flex-col gap-5 max-w-2xl mx-auto">
              {donations.map((d) => (
                <li
                  key={d.id}
                  className="border-b border-rule pb-5 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                    <p className="font-display text-ink">
                      {displayName(d)}
                      {d.showAmount && (
                        <span className="text-eye-deep ml-2 text-sm">
                          · {formatMoney(d.amountCents)}
                        </span>
                      )}
                    </p>
                    <time
                      className="text-xs uppercase tracking-[0.14em] text-ink-faint"
                      dateTime={new Date(d.timestamp).toISOString()}
                    >
                      {formatDate(d.timestamp)}
                    </time>
                  </div>
                  <p className="font-serif italic text-ink-muted leading-relaxed">
                    &ldquo;{d.note}&rdquo;
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

    </div>
  );
}
