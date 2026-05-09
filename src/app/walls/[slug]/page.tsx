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
import { EyeDivider } from "@/components/Eyes";

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
      {/* === Header === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Predator Wall</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            {wall.title}
          </h1>
          {wall.intro && (
            <p className="deck max-w-2xl mx-auto fade-up stagger-3">
              {wall.intro}
            </p>
          )}
        </div>
      </section>

      <EyeDivider />

      {/* === Takedown body === */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div
          className="prose-article"
          dangerouslySetInnerHTML={{ __html: wall.takedownHtml }}
        />
      </div>

      <EyeDivider />

      {/* === Donate === */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-8">
          <p className="eyebrow mb-3">Back this takedown</p>
          <h2
            className="font-display tracking-tight mb-4 leading-[1.05]"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Add your name to the wall.
          </h2>
          <p className="deck max-w-xl mx-auto">
            Your donation funds more work like this. Your note becomes
            part of the artifact.
          </p>
        </div>
        {wall.status === "active" ? (
          <div className="bg-surface border border-ink/10 p-8 md:p-10 max-w-xl mx-auto">
            <WallDonateCard wallSlug={wall.slug} />
          </div>
        ) : (
          <p className="text-center italic text-ink-muted">
            This wall is closed to new donations.
          </p>
        )}
      </section>

      <EyeDivider />

      {/* === Wall display === */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <p className="eyebrow mb-3">The Wall</p>
          <p
            className="font-display text-ink mb-2"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {formatMoney(stats.totalRaisedCents)}
          </p>
          <p className="text-sm uppercase tracking-[0.18em] text-ink-faint">
            raised · {stats.donorCount}{" "}
            {stats.donorCount === 1 ? "backer" : "backers"}
          </p>
        </div>

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

        {stats.topDonor && (
          <div className="border-2 border-eye bg-eye/5 p-6 mb-8 relative">
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

        <ul className="flex flex-col gap-5">
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
      </section>
    </div>
  );
}
