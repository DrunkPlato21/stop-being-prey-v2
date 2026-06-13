import Link from "next/link";
import type { Metadata } from "next";
import { getGiftByToken } from "@/lib/gifts";
import { RedeemSeat } from "@/components/RedeemSeat";

// Gift redemption landing. The token in the URL is the single-use-ish
// credential (minted on the paid flip, useless before payment). The
// page is intentionally readable when signed out — the recipient has
// no account yet. COPY IS PLACEHOLDER — Clay finalizes.

export const metadata: Metadata = {
  title: "Take your seat",
  description: "Someone put you in the room.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GiftRedeemPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const gift = await getGiftByToken(token);

  const valid =
    gift !== null &&
    (gift.status === "paid" || gift.status === "redeemed");

  if (!valid) {
    return (
      <div>
        <section className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-24 text-center">
          <p className="eyebrow mb-6">Stop Being Prey</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-8"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            This link doesn&apos;t open anything.
          </h1>
          <p
            className="font-serif text-ink-muted leading-relaxed max-w-md mx-auto"
            style={{ fontSize: "1.02rem" }}
          >
            The gift link is wrong or no longer live. Check the email it
            came in, or ask the person who sent it.
          </p>
          <p className="mt-10">
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

  const buyerName = gift.buyerName || "A reader";
  const termLabel = gift.termMonths === 3 ? "3 months" : "1 year";

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Someone paid it forward
          </p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {buyerName} bought you a seat.
          </h1>
          <div className="max-w-md mx-auto fade-up stagger-3 space-y-4">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              {termLabel}{" "}inside Stop Being Prey. The members-only
              comments, the Writer&apos;s Desk, the lounge, the Case
              Files. All of it, paid for, waiting on you.
            </p>
          </div>
          {gift.message && (
            <blockquote
              className="max-w-md mx-auto mt-8 pl-6 border-l-2 border-eye text-left fade-up stagger-3"
            >
              <p
                className="font-serif italic text-ink leading-relaxed"
                style={{ fontSize: "1.05rem" }}
              >
                &ldquo;{gift.message}&rdquo;
              </p>
              <p
                className="font-serif text-ink-muted mt-2"
                style={{ fontSize: "0.9rem" }}
              >
                &ndash; {buyerName}
              </p>
            </blockquote>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <RedeemSeat
          token={token}
          recipientEmail={gift.recipientEmail}
          alreadyRedeemed={gift.status === "redeemed"}
        />
      </section>
    </div>
  );
}
