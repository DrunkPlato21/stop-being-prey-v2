import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { SESSION_COOKIE } from "@/lib/auth";
import {
  createCustomerPortalSession,
  isStripeConfigured,
} from "@/lib/membership";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Stop Being Prey membership.",
};

export const dynamic = "force-dynamic";

// Authenticated members land here. We don't host an account UI; we
// redirect into the Stripe Customer Portal which handles cancel /
// update card / billing history. Logged-out visitors get bounced to
// /notes/sign-in. Misconfigured environments render a soft fallback
// with the right diagnostic.

function authSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export default async function MembershipAccountPage() {
  const secret = authSecret();
  if (!secret) {
    return <ConfigError reason="AUTH_SECRET is not set." />;
  }

  if (!isStripeConfigured()) {
    return <ConfigError reason="STRIPE_SECRET_KEY is not set." />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/notes/sign-in?next=%2Fmembership%2Faccount");
  }

  let customerId: string | null = null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.customerId === "string") {
      customerId = payload.customerId;
    }
  } catch {
    redirect("/notes/sign-in?next=%2Fmembership%2Faccount");
  }

  if (!customerId) {
    redirect("/notes/sign-in?next=%2Fmembership%2Faccount");
  }

  const result = await createCustomerPortalSession(customerId);
  if ("error" in result) {
    return <ConfigError reason={result.error} />;
  }
  redirect(result.url);
}

function ConfigError({ reason }: { reason: string }) {
  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-16 text-center">
        <p className="eyebrow mb-6">Account</p>
        <h1
          className="font-display text-ink leading-tight tracking-tight mb-6"
          style={{
            fontSize: "clamp(2rem, 4vw, 2.75rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          The portal isn&apos;t reachable right now.
        </h1>
        <p className="deck mb-8 max-w-md mx-auto">
          Try again in a moment. If it persists, email{" "}
          <a
            href="mailto:clay@readsowell.com"
            className="text-eye-deep hover:text-ink"
          >
            clay@readsowell.com
          </a>{" "}
          and Clay will sort it out manually.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <p className="text-xs italic text-ink-faint mb-10">
            (dev diagnostic) {reason}
          </p>
        )}
        <Link
          href="/desk"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to the writer&apos;s desk
        </Link>
      </section>
    </div>
  );
}
