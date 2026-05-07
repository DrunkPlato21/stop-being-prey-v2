import Link from "next/link";
import type { Metadata } from "next";
import { getCheckoutSessionInfo } from "@/lib/membership";
import { createMagicLink } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

export const metadata: Metadata = {
  title: "Welcome inside",
  description: "Your membership is live. The Field Notes archive is open.",
};

// Stripe redirects new members here after a successful Checkout. We
// pull the email and customer id off the Checkout Session, mint a
// magic link with /notes as the destination, and send the welcome
// email immediately so the member can step inside without waiting.

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  let email: string | null = null;
  let dispatched = false;
  let error: string | null = null;

  if (session_id) {
    const info = await getCheckoutSessionInfo(session_id);
    if (info?.email && info.customerId) {
      email = info.email;
      const id = await createMagicLink({
        email: info.email,
        customerId: info.customerId,
        next: "/notes",
      }).catch(() => null);
      if (id) {
        const baseUrl = (
          process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
        ).replace(/\/$/, "");
        const url = `${baseUrl}/api/auth/callback?token=${encodeURIComponent(
          id
        )}`;
        const result = await sendMagicLink({ to: info.email, url });
        if (result.ok) {
          dispatched = true;
        } else {
          error = result.error;
        }
      }
    }
  }

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">You&apos;re in</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Welcome inside.
        </h1>

        <div
          className="font-display italic text-ink leading-[1.3] mx-auto fade-up stagger-3"
          style={{ fontSize: "clamp(1.2rem, 2.5vw, 1.55rem)", fontWeight: 400 }}
        >
          <p className="mb-5">
            membership is live. the field notes archive is open.
          </p>
          {dispatched && email ? (
            <p className="mb-5">
              a sign-in link is on its way to{" "}
              <span className="not-italic font-display text-eye-deep">
                {email}
              </span>
              . click it to step inside.
            </p>
          ) : email ? (
            <p className="mb-5">
              we couldn&apos;t deliver your sign-in link automatically. request
              one from the sign-in page below.
            </p>
          ) : (
            <p className="mb-5">
              your sign-in link is queued. check your inbox in a moment.
            </p>
          )}
          <p>
            stay close,
            <br />~ Clay
          </p>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <Link href="/notes/sign-in" className="btn-primary">
            <span>request a sign-in link</span>
          </Link>
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← back home
          </Link>
        </div>

        {error && process.env.NODE_ENV !== "production" && (
          <p className="mt-8 text-xs italic text-ink-faint">
            (dev) email send error: {error}
          </p>
        )}
      </section>
    </div>
  );
}
