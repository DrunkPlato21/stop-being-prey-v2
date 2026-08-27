import Link from "next/link";
import type { Metadata } from "next";
import { ReactivateForm } from "@/components/ReactivateForm";
import { GRANTED_SEAT_MONTHLY_FLOOR_CENTS } from "@/lib/membership";

// Self-serve reactivation for a lapsed member (card expired / payment
// failed / subscription canceled). Enter email → Stripe Checkout to add a
// new card → back in at the locked rate with founder standing intact.
// Replaces hand-building subscriptions in the Stripe dashboard. COPY IS
// DRAFT — Clay finalizes.

export const metadata: Metadata = {
  title: "Reactivate your seat",
  description:
    "Your card lapsed? Add a new one and come back at your locked rate, founder standing and all.",
};

export const dynamic = "force-dynamic";

export default async function ReactivatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The lapsed-membership email arrives with ?email= attached so the
  // form is already filled when they land.
  const sp = await searchParams;
  const raw = sp.email;
  const initialEmail = typeof raw === "string" ? raw.trim().slice(0, 254) : "";

  // Two audiences land here now. The lapsed member arrives from the
  // billing email and the copy above was written for them: a card
  // expired, standing intact, back at the locked rate. Someone coming
  // off a donated seat matches none of that. They never had a card, are
  // not lapsed, and are not a founder, so the default page would open by
  // describing a situation that is not theirs. The "keep your seat"
  // reminders tag themselves ?src=gift / ?src=pool, which is the only
  // signal available before an email is typed.
  //
  // COPY IS DRAFT, same as the block above. Clay finalizes.
  const src = typeof sp.src === "string" ? sp.src : "";
  const grantedSeat = src === "gift" || src === "pool";
  const heldRate = `$${(GRANTED_SEAT_MONTHLY_FLOOR_CENTS / 100).toFixed(0)}`;
  const covered =
    src === "gift" ? "Someone bought you a seat" : "A reader covered your seat";

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            {grantedSeat ? "Your seat" : "Come back"}
          </p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {grantedSeat ? "Keep your seat." : "Reactivate your seat."}
          </h1>
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            {grantedSeat ? (
              <>
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.08rem" }}
                >
                  {covered} and that term is ending. Nothing closes behind
                  you. Everything you have read stays yours, and the room
                  is in the same place you left it.
                </p>
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.08rem" }}
                >
                  Add a card below and you carry on at {heldRate} a month.
                  That is the rate your seat was given at, and it stays
                  yours even when the price for new members goes up.
                </p>
              </>
            ) : (
              <>
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.08rem" }}
                >
                  A card expires, a charge fails, and the seat lapses. It
                  happens. Nothing about your standing changed while you
                  were gone.
                </p>
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.08rem" }}
                >
                  Add a new card below and you&apos;re back in, at the exact
                  rate you locked in. If you were a founder, you&apos;re
                  still a founder, same number, same price. It renews on its
                  own from here, no invoices to chase.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <ReactivateForm initialEmail={initialEmail} grantedSeat={grantedSeat} />
      </section>

      <div className="text-center pb-16">
        <Link
          href="/patronage?src=reactivate"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to patronage
        </Link>
      </div>
    </div>
  );
}
