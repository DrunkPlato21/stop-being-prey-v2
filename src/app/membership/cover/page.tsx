import Link from "next/link";
import type { Metadata } from "next";
import { PoolChipIn } from "@/components/PoolChipIn";
import { PoolCounter } from "@/components/PoolCounter";
import { EyeDivider } from "@/components/Eyes";

// Back the community pool: cover a seat for a reader who can't afford one.
// Anonymous both ways, no named recipient. One module, any amount — a few
// dollars pools toward a seat, $39 funds a whole one now (the old separate
// "fund a full seat" form folded in, since with the pot a whole seat is
// just a $39 contribution). The named, personal side lives on its own
// page, /membership/gift. COPY IS PLACEHOLDER — Clay finalizes.

export const metadata: Metadata = {
  title: "Cover a seat",
  description:
    "Back the community pool. Put a reader who can't afford it inside Stop Being Prey. Any amount, anonymous, one charge.",
};

// Reads the live pot + counter, so render per request.
export const dynamic = "force-dynamic";

export default async function CoverSeatPage({
  searchParams,
}: {
  searchParams?: Promise<{ chipped_in?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const chippedIn = sp.chipped_in === "1";

  return (
    <div>
      {chippedIn && (
        <div className="bg-surface border-b border-rule">
          <div className="max-w-3xl mx-auto px-6 py-4 text-center">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1rem" }}
            >
              Your contribution is in the pot. Thank you for the push toward
              the next seat.
            </p>
          </div>
        </div>
      )}

      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Pay it forward</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Cover a seat.
          </h1>
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Someone out there needs this room and can&apos;t swing the
              price. You don&apos;t know them. You never will. Put them in
              it anyway.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Put in what you can. A few dollars pools with other readers
              toward a seat. A whole seat is thirty-nine dollars: a full
              season, three months in the room. Either way it goes into the
              pool and a reader who couldn&apos;t afford it claims it
              privately. No names on any side.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              This room exists because readers backed it before there was
              proof it would work. This is the same move, one person down
              the line.
            </p>
          </div>
        </div>
      </section>

      {/* The one module: bar + amount */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-10">
          <p className="eyebrow mb-3">Back a seat</p>
          <h2
            className="font-display text-ink leading-tight tracking-tight"
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Put in what you can.
          </h2>
        </div>
        <PoolChipIn />
        <div className="max-w-md mx-auto mt-10 pt-8 border-t border-rule">
          <PoolCounter />
        </div>
      </section>

      {/* Cross-link to the named side */}
      <section className="max-w-md mx-auto px-6 pb-14">
        <div className="border-t border-rule pt-8 text-center">
          <p
            className="font-serif text-ink-muted leading-relaxed mb-3"
            style={{ fontSize: "0.98rem" }}
          >
            Know exactly who it&apos;s for?
          </p>
          <Link
            href="/membership/gift"
            className="group inline-flex items-center gap-1.5 no-underline"
          >
            <span
              className="font-display text-ink group-hover:text-eye-deep transition-colors"
              style={{ fontSize: "1.05rem", fontWeight: 600 }}
            >
              Gift a seat to someone you know
            </span>
            <span
              className="text-eye-deep transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              &rarr;
            </span>
          </Link>
        </div>
      </section>

      <EyeDivider />

      {/* How it works */}
      <section className="max-w-xl mx-auto px-6 py-14 md:py-16">
        <p className="eyebrow mb-6 text-center">How it works</p>
        <ol className="space-y-5">
          {[
            "You put in what you can. Any amount from five dollars. A whole seat is thirty-nine dollars: a season, three months for one reader.",
            "Contributions pool together. Each time the pot fills a seat, an anonymous seat drops into the pool.",
            "A reader who can't afford the room claims it privately. They never see you, you never see them.",
            "You get a note when your contribution lands, and again if it tips a seat over.",
          ].map((step, i) => (
            <li key={i} className="flex gap-4">
              <span
                className="font-display text-eye-deep leading-none"
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              >
                {i + 1}.
              </span>
              <span
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.02rem" }}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="text-center pb-16">
        <Link
          href="/membership?src=cover"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to membership
        </Link>
      </div>
    </div>
  );
}
