import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { SESSION_COOKIE } from "@/lib/auth";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { EditDisplayNameForm } from "@/components/EditDisplayNameForm";
import { NotifyOnReplyToggle } from "@/components/NotifyOnReplyToggle";
import {
  getProfile,
  isCommentsConfigured,
  notifyOnReply,
} from "@/lib/comments";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Stop Being Prey membership.",
};

export const dynamic = "force-dynamic";

function authSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export default async function AccountPage() {
  const secret = authSecret();
  if (!secret) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  let email = "";
  let customerId = "";
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.email === "string") email = payload.email;
    if (typeof payload.customerId === "string") customerId = payload.customerId;
  } catch {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  if (!email) {
    redirect("/notes/sign-in?next=%2Fnotes%2Faccount");
  }

  // DEV_AUTO_GRANT mints synthetic customer IDs of the form `dev_<email>`.
  // Real Stripe customer IDs always start with `cus_`. Stripe's Customer
  // Portal will reject any other shape, so detect and show a placeholder
  // instead of letting the user click into a guaranteed error.
  const stripeReady = customerId.startsWith("cus_");

  const profile =
    isCommentsConfigured() ? await getProfile(email) : null;

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Account.
          </h1>
        </div>
      </section>

      <section className="max-w-xl mx-auto px-6 py-14 md:py-20">
        {/* Email */}
        <div className="mb-12">
          <p className="eyebrow mb-3">Signed in as</p>
          <p
            className="font-display text-ink leading-tight tracking-tight"
            style={{
              fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
              fontWeight: 500,
              letterSpacing: "-0.01em",
              wordBreak: "break-all",
            }}
          >
            {email}
          </p>
        </div>

        {/* Display name */}
        {isCommentsConfigured() && (
          <div className="mb-12 pt-10 border-t border-rule">
            <EditDisplayNameForm
              initialDisplayName={profile?.displayName || null}
            />
          </div>
        )}

        {/* Email notifications */}
        {isCommentsConfigured() && (
          <div className="mb-12 pt-10 border-t border-rule">
            <NotifyOnReplyToggle initialValue={notifyOnReply(profile)} />
          </div>
        )}

        {/* Subscription block */}
        <div className="mb-12 pt-10 border-t border-rule">
          <p className="eyebrow mb-3">Subscription</p>
          {stripeReady ? (
            <>
              <p
                className="font-serif text-ink-muted leading-relaxed mb-6"
                style={{ fontSize: "1.02rem" }}
              >
                Update card, switch plans, view invoices, or cancel from
                the Stripe portal.
              </p>
              <ManageSubscriptionButton />
            </>
          ) : (
            <p
              className="font-serif italic text-ink-muted leading-relaxed"
              style={{ fontSize: "1.02rem" }}
            >
              Subscription management will be available once Stripe is
              wired in.
            </p>
          )}
        </div>

        {/* Sign out */}
        <div className="pt-10 border-t border-rule">
          <p className="eyebrow mb-3">Session</p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="btn-secondary"
            >
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
