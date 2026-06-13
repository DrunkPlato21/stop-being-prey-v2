import Link from "next/link";
import type { Metadata } from "next";
import { pollGiftBySession } from "@/lib/gifts";
import { pollPoolFundBySession } from "@/lib/pool";

// Post-checkout landing for a gift OR a pool-fund purchase. The webhook
// flips the record (lane "gift" or "pool") and sends the relevant email;
// we poll briefly so the page can confirm specifically instead of a
// vague "processing". The ?pool=1 flag (set by createPoolCheckoutSession)
// routes the anonymous pool confirmation. COPY IS PLACEHOLDER — Clay
// finalizes.

export const metadata: Metadata = {
  title: "Seat bought",
  description: "Your gift is on its way.",
};

export const dynamic = "force-dynamic";

export default async function GiftSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ session_id?: string; pool?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const sessionId =
    typeof sp.session_id === "string" ? sp.session_id : null;

  // Anonymous pool fund: no recipient to name, so confirm the seat
  // landed in the pool and frame the pay-it-forward chain.
  if (sp.pool === "1") {
    const fund = sessionId ? await pollPoolFundBySession(sessionId) : null;
    const funded = fund?.status === "funded" || fund?.status === "claimed";
    const termLabel =
      fund?.termMonths === 3 ? "3 months" : fund ? "1 year" : null;
    return (
      <div>
        <section className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-24 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Pay it forward</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            You funded a seat.
          </h1>
          <div className="max-w-md mx-auto fade-up stagger-3 space-y-4">
            {funded ? (
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.05rem" }}
              >
                {termLabel} in the room, waiting for someone who couldn&apos;t
                swing it. They may claim it today, or it may wait in the pool
                until the right person finds it.
              </p>
            ) : (
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.05rem" }}
              >
                Your payment landed. The seat is being added to the pool
                right now.
              </p>
            )}
            <p
              className="font-serif italic text-ink-muted leading-relaxed"
              style={{ fontSize: "0.95rem" }}
            >
              No names on either side. You put someone in here who
              wouldn&apos;t be otherwise. Thank you.
            </p>
          </div>
          <p className="mt-12">
            <Link
              href="/"
              className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
              style={{ fontWeight: 500 }}
            >
              ← back home
            </Link>
          </p>
        </section>
      </div>
    );
  }

  const gift = sessionId ? await pollGiftBySession(sessionId) : null;

  const blocked = gift?.status === "blocked_self";
  const confirmed = gift?.status === "paid" || gift?.status === "redeemed";

  return (
    <div>
      <section className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-24 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">Pay it forward</p>
        {blocked ? (
          <>
            <h1
              className="font-display text-ink leading-[1.05] tracking-tight mb-8 fade-up stagger-2"
              style={{
                fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.022em",
              }}
            >
              That seat was for someone else.
            </h1>
            <div className="max-w-md mx-auto fade-up stagger-3 space-y-4">
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.05rem" }}
              >
                The gift was addressed to your own email, so it can&apos;t
                be handed back to you. Your payment is being refunded in
                full; details are in your inbox.
              </p>
              <p
                className="font-serif text-ink-muted leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                Want a seat of your own?{" "}
                <Link
                  href="/membership"
                  className="text-eye-deep hover:text-ink"
                >
                  The door is here.
                </Link>
              </p>
            </div>
          </>
        ) : (
          <>
            <h1
              className="font-display text-ink leading-[1.05] tracking-tight mb-8 fade-up stagger-2"
              style={{
                fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.022em",
              }}
            >
              The seat is theirs.
            </h1>
            <div className="max-w-md mx-auto fade-up stagger-3 space-y-4">
              {confirmed && gift ? (
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.05rem" }}
                >
                  An email is on its way to{" "}
                  <span className="font-display text-eye-deep">
                    {gift.recipientEmail}
                  </span>{" "}
                  telling them you put them in the room, with a link to
                  take their seat.
                </p>
              ) : (
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.05rem" }}
                >
                  Your payment landed. The invitation email goes out to
                  them within the next minute or two.
                </p>
              )}
              <p
                className="font-serif italic text-ink-muted leading-relaxed"
                style={{ fontSize: "0.95rem" }}
              >
                You&apos;ll get an email when they claim it. Thank you for
                putting someone in the room.
              </p>
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                Want to give them a heads up yourself? A word from you
                means more than our email ever could.
              </p>
            </div>
          </>
        )}
        <p className="mt-12">
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← back home
          </Link>
        </p>
      </section>
    </div>
  );
}
