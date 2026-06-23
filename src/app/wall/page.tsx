import Link from "next/link";
import type { Metadata } from "next";
import { listVisible } from "@/lib/supporters";
import { SignTheWall } from "@/components/SignTheWall";
import { LightningCard } from "@/components/LightningCard";
import { EyeDivider } from "@/components/Eyes";

export const metadata: Metadata = {
  title: "The Wall",
  description:
    "Stop Being Prey runs on readers, not ads or sponsors. Add your name.",
};

export const revalidate = 60;

const LIGHTNING_ADDRESS = "stopbeingprey@walletofsatoshi.com";

// The wall — a reader-funding surface, wall-first. Support-first: back the
// work with a dollar and your name goes up; a line is optional. /tip
// redirects here. The full, paginated wall lives at /supporters; this page
// shows a living window of it above the ask.

export default async function WallPage() {
  const { entries } = await listVisible(1, 48).catch(() => ({
    entries: [],
    total: 0,
  }));

  const tiles = entries.map((e) => ({
    id: e.id,
    message: e.message,
    attribution: e.attribution,
  }));

  return (
    <div>
      {/* Hero — sincere, support-first */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">The Wall</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Add your name.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Stop Being Prey runs on readers, not ads or sponsors. Back it with
            a dollar and your name goes on the wall. Leave a line if you have
            one.
          </p>
          <div className="mt-9 fade-up stagger-4">
            <Link href="#sign" className="btn-primary">
              <span>Sign the wall — $1</span>
            </Link>
          </div>
        </div>
      </section>

      {/* The wall itself — a roll of names, lines scattered through */}
      <section className="max-w-6xl mx-auto px-6 py-14 md:py-20">
        {tiles.length === 0 ? (
          <p className="font-display italic text-ink-muted text-center leading-relaxed">
            The wall&apos;s just getting started. Be the first name on it.
          </p>
        ) : (
          <>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 md:gap-5">
              {tiles.map((tile) => (
                <figure
                  key={tile.id}
                  className={`break-inside-avoid mb-4 md:mb-5 border border-rule bg-paper-deep px-5 ${
                    tile.message ? "py-5" : "py-4"
                  }`}
                >
                  {tile.message && (
                    <blockquote
                      className="font-display italic text-ink leading-snug mb-3"
                      style={{ fontSize: "1.02rem", fontWeight: 400 }}
                    >
                      {tile.message}
                    </blockquote>
                  )}
                  <figcaption
                    className={
                      tile.message ? "eyebrow" : "font-display text-ink-muted"
                    }
                    style={
                      tile.message
                        ? { letterSpacing: "0.2em", fontSize: "0.6rem" }
                        : { fontSize: "0.95rem", fontWeight: 500 }
                    }
                  >
                    {tile.attribution}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link
                href="/supporters"
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                See the full wall →
              </Link>
            </div>
          </>
        )}
      </section>

      <EyeDivider />

      {/* The signing card */}
      <section id="sign" className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <SignTheWall />

        {/* Bitcoin is the quiet, no-wall give path — folded in so the
            redirect from /tip doesn't drop a payment method. */}
        <details className="max-w-xl mx-auto mt-8 group">
          <summary className="cursor-pointer list-none text-center font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep transition-colors">
            Prefer Bitcoin? Pay over Lightning →
          </summary>
          <div className="mt-8">
            <LightningCard lightningAddress={LIGHTNING_ADDRESS} />
          </div>
        </details>

        <p
          className="font-display italic text-ink-muted text-center leading-relaxed max-w-md mx-auto mt-12"
          style={{ fontSize: "1.15rem", fontWeight: 400 }}
        >
          No ads. No sponsors. No one I have to keep happy. When readers fund
          the work, the work answers to readers. That&apos;s the whole point.
        </p>
      </section>

      {/* Quiet path back */}
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
