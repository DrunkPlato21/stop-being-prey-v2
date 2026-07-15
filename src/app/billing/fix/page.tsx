import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { verifyBillingToken } from "@/lib/auth";
import { createCustomerPortalSession } from "@/lib/membership";

// Public, no-login billing recovery.
//
// The invoice.payment_failed email links here with a signed 30-day token.
// We verify it, mint a FRESH Stripe customer-portal session, and bounce
// straight to Stripe's card-update page. No sign-in required by design:
// a large share of members subscribe purely to support and never log in,
// so a login-gated card fix silently loses exactly those people. The
// token grants nothing but this portal hop (see signBillingToken).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Update your card",
  description: "Update the card on your membership.",
  robots: { index: false, follow: false },
};

export default async function BillingFixPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const customerId = await verifyBillingToken(token);

  // Only real Stripe customers can open a portal; synthetic ids
  // (admin_*, dev_*) never carry a payment method.
  let portalUrl: string | null = null;
  if (customerId && customerId.startsWith("cus_")) {
    const result = await createCustomerPortalSession(
      customerId,
      "/billing/updated"
    );
    if ("url" in result) portalUrl = result.url;
  }

  // redirect() throws internally, so it must be called outside any
  // try/catch and after all awaits resolve.
  if (portalUrl) redirect(portalUrl);

  // Fallback: the token was missing, expired (past the 30-day window), or
  // couldn't be turned into a portal session. Keep it plain and warm, with
  // one obvious next step — no jargon about tokens or Stripe.
  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Membership</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          This link has expired.
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">
          For your security the card-update link only stays live for a
          while. Reactivate your seat below and you&apos;ll be right back in
          at your locked rate.
        </p>

        <Link
          href="/reactivate"
          className="inline-block font-display uppercase tracking-[0.22em] no-underline"
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            background: "var(--ink, #1a1714)",
            color: "#f5efe1",
            padding: "14px 30px",
            border: "1px solid var(--ink, #1a1714)",
          }}
        >
          Reactivate your seat
        </Link>

        <p className="mt-12 text-sm italic text-ink-muted leading-relaxed max-w-md mx-auto">
          Stuck, or think this is a mistake? Email{" "}
          <a
            href="mailto:clay@stopbeingprey.com"
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            clay@stopbeingprey.com
          </a>{" "}
          and I&apos;ll sort it out personally.
        </p>
      </section>
    </div>
  );
}
