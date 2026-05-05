import Link from "next/link";
import type { Metadata } from "next";
import { listVisible } from "@/lib/supporters";

export const metadata: Metadata = {
  title: "The Supporters",
  description:
    "Readers who chose to be named. Stop Being Prey runs on them.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 20;

export default async function SupportersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const pageParam = Number(params.page);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const { entries, total } = await listVisible(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages && entries.length === PAGE_SIZE;

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-20 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Wall of supporters</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            The Supporters
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Readers who chose to be named. The work runs on them.
          </p>
        </div>
      </section>

      {/* List */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        {entries.length === 0 ? (
          <p className="font-display italic text-ink-muted text-center leading-relaxed">
            {page > 1
              ? "No supporters on this page."
              : "The wall is empty for now. Be the first."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <li
                key={entry.id}
                className={
                  idx === 0
                    ? "py-8"
                    : "py-8 border-t border-rule"
                }
              >
                <blockquote
                  className="font-display italic text-ink leading-snug mb-4"
                  style={{ fontSize: "1.1rem", fontWeight: 400 }}
                >
                  {entry.message}
                </blockquote>
                <p className="eyebrow" style={{ letterSpacing: "0.22em" }}>
                  — {entry.attribution}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {(hasPrev || hasNext) && (
          <div className="flex items-center justify-between mt-12 pt-8 border-t border-rule">
            {hasPrev ? (
              <Link
                href={
                  page === 2 ? "/supporters" : `/supporters?page=${page - 1}`
                }
                className="font-display text-sm uppercase tracking-[0.18em] text-ink-muted hover:text-eye-deep no-underline"
                style={{ fontWeight: 500 }}
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs italic text-ink-faint">
              Page {page} of {totalPages}
            </span>
            {hasNext ? (
              <Link
                href={`/supporters?page=${page + 1}`}
                className="font-display text-sm uppercase tracking-[0.18em] text-ink-muted hover:text-eye-deep no-underline"
                style={{ fontWeight: 500 }}
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>

      {/* Footer-of-page link back to tip */}
      <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
        <Link
          href="/tip"
          className="font-display text-sm uppercase tracking-[0.18em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          Add your name →
        </Link>
      </section>
    </div>
  );
}
