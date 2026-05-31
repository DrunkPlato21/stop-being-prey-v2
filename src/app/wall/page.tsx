import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { TabbedTipCard } from "@/components/TabbedTipCard";
import { EyeDivider } from "@/components/Eyes";
import { listVisible } from "@/lib/supporters";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";

// /wall: experimental sibling to /tip that leads with the supporters
// wall as the hero (public, permanent, named visibility) rather than
// the funding ask. Re-uses /tip's exact visual primitives (fonts,
// ornaments, spacing, TabbedTipCard) so the two pages read as one
// system; only the framing and copy differ.
//
// Deliberately separate from /tip: /tip is the proven converter and is
// left untouched. The only shared-component changes are opt-in props
// (TabbedTipCard.autoFillName) so /tip renders bit-for-bit unchanged.
//
// Singular /wall (the main supporters wall) coexists with the plural
// /walls/[slug] per-piece walls (Marek, etc.).

export const metadata: Metadata = {
  title: "The Supporters Wall",
  description:
    "Public. Permanent. Named. Leave your message on the Stop Being Prey supporters wall.",
};

// Reads the session cookie to auto-fill member attribution, so the
// route renders per-request rather than statically.
export const dynamic = "force-dynamic";

const LIGHTNING_ADDRESS = "stopbeingprey@walletofsatoshi.com";
const ANONYMOUS_LABEL = "a reader writes";

const HERO_DECK =
  "Every reader who shows up gets their name on this wall. With a message. With a date. With a permanent place in this thing we're building.";
const ADD_HEADING =
  "Leave a message. Pick an amount. Your name goes up when it clears.";
const CLOSE_LINE =
  "Every name on this wall is a reader who chose to be seen. That's the work.";

const trustLines: string[] = [
  "tips fund the writing, the podcast, the time the project takes. they go to me directly.",
  "your name appears on the wall the moment your tip clears. you can write whatever you want. cruelty doesn't get posted.",
  "not tax-deductible. this isn't charity. it's a public record of the readers keeping this thing alive.",
];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function WallPage() {
  // Resolve the signed-in member's account display name server-side
  // (auth.ts is server-only: it holds AUTH_SECRET). We thread the
  // resolved name down as a plain prop rather than checking the session
  // inside the client card. Anonymous visitors => null => the card
  // behaves exactly as it does on /tip.
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  let autoFillName: string | null = null;
  if (session?.email) {
    const profile = await getProfile(session.email).catch(() => null);
    const dn = profile?.displayName?.trim();
    if (dn) autoFillName = dn;
  }

  // Live wall preview: pull a window of recent supporters and keep the
  // named ones. Show up to 12 on desktop, 6 on mobile (the rest are
  // hidden below the sm breakpoint).
  const recent = await listVisible(1, 40).catch(() => ({
    entries: [],
    total: 0,
  }));
  const named = recent.entries
    .filter((e) => e.attribution !== ANONYMOUS_LABEL)
    .slice(0, 12);

  return (
    <div>
      {/* === Hero: the wall is the lead, not the ask === */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Public. Permanent. Named.
          </p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Leave your mark on the wall.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">{HERO_DECK}</p>
        </div>
      </section>

      {/* === Live wall preview === */}
      <section className="max-w-5xl mx-auto px-6 pt-12 md:pt-16 pb-4">
        {named.length > 0 ? (
          <>
            <p className="eyebrow text-center mb-6 md:mb-8">On the wall</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8 max-w-4xl mx-auto">
              {named.map((entry, i) => (
                <li
                  key={entry.id}
                  className={`border-l-2 border-eye pl-5 py-1${
                    i >= 6 ? " hidden sm:block" : ""
                  }`}
                >
                  <blockquote
                    className="font-display italic text-ink leading-snug mb-3"
                    style={{ fontSize: "1rem", fontWeight: 400 }}
                  >
                    {entry.message}
                  </blockquote>
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className="eyebrow"
                      style={{ letterSpacing: "0.22em", fontSize: "0.62rem" }}
                    >
                      {entry.attribution}
                    </p>
                    <span
                      className="font-serif italic text-ink-faint shrink-0"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-center font-serif italic text-ink-muted">
            The wall is empty for now. Be the first name on it.
          </p>
        )}

        {/* See the full wall → existing /supporters page */}
        <div className="mt-10 text-center">
          <Link
            href="/supporters"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            see the full wall →
          </Link>
        </div>
      </section>

      {/* === Add yourself: the tip card framed as the mechanism === */}
      <section className="max-w-5xl mx-auto px-6 pt-10 md:pt-14 pb-16 md:pb-20">
        <div className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <p className="eyebrow mb-4">Add yourself</p>
          <h2
            className="font-display text-ink leading-[1.08] tracking-tight"
            style={{
              fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {ADD_HEADING}
          </h2>
          {autoFillName && (
            <p
              className="font-serif italic text-ink-muted leading-relaxed mt-4 max-w-md mx-auto"
              style={{ fontSize: "0.92rem" }}
            >
              Signed in as {autoFillName}. Your name is filled in below.
              Edit it, clear it, or go anonymous however you like.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-start">
          <div className="md:col-span-7">
            <TabbedTipCard
              lightningAddress={LIGHTNING_ADDRESS}
              autoFillName={autoFillName}
            />
          </div>
          <aside className="md:col-span-5">
            <div className="flex flex-col items-center md:items-start gap-6">
              <Image
                src="/images/clay-winter.jpg"
                alt="Clay, founder of Stop Being Prey"
                width={400}
                height={500}
                sizes="(min-width: 768px) 200px, 200px"
                className="border border-border block"
                style={{
                  width: "200px",
                  height: "250px",
                  objectFit: "cover",
                  objectPosition: "center top",
                }}
              />
              <div className="text-center md:text-left max-w-xs space-y-5">
                {trustLines.map((line, i) => (
                  <p
                    key={i}
                    className="font-serif italic text-ink-muted leading-relaxed"
                    style={{ fontSize: "0.95rem" }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <EyeDivider />

      {/* === Close === */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p
          className="font-display italic text-ink-muted leading-relaxed mb-10"
          style={{ fontSize: "1.3rem", fontWeight: 400 }}
        >
          {CLOSE_LINE}
        </p>
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
