"use client";

import { useState } from "react";

// Single tier with monthly / yearly toggle. Yearly saves $21 vs paying
// monthly for 12 months. Click "Become a member" to POST to the
// checkout API and redirect to Stripe.

type Plan = "monthly" | "yearly";

const PLANS: Record<
  Plan,
  { price: string; cadence: string; sub: string }
> = {
  monthly: {
    price: "$10",
    cadence: "/month",
    sub: "billed monthly. cancel anytime.",
  },
  yearly: {
    price: "$99",
    cadence: "/year",
    sub: "saves $21 vs monthly. cancel anytime.",
  },
};

export function MembershipPlans() {
  const [plan, setPlan] = useState<Plan>("yearly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/membership/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "checkout_failed");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout_failed");
      setLoading(false);
    }
  }

  const current = PLANS[plan];

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Plan toggle */}
      <div
        className="flex border border-ink mb-8"
        role="tablist"
        aria-label="Billing cadence"
      >
        <button
          type="button"
          role="tab"
          aria-selected={plan === "monthly"}
          onClick={() => setPlan("monthly")}
          className={`plan-toggle${
            plan === "monthly" ? " plan-toggle-active" : ""
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={plan === "yearly"}
          onClick={() => setPlan("yearly")}
          className={`plan-toggle${
            plan === "yearly" ? " plan-toggle-active" : ""
          }`}
        >
          Yearly
        </button>
      </div>

      {/* Price + CTA */}
      <div className="text-center mb-6">
        <p
          className="font-display text-ink leading-none mb-3"
          style={{
            fontSize: "clamp(2.75rem, 6vw, 3.75rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {current.price}
          <span
            className="font-serif italic text-ink-muted"
            style={{
              fontSize: "1rem",
              fontWeight: 400,
              letterSpacing: 0,
              marginLeft: "0.4rem",
            }}
          >
            {current.cadence}
          </span>
        </p>
        <p className="text-sm italic text-ink-faint">{current.sub}</p>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="btn-primary w-full justify-center"
        style={{
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "wait" : "pointer",
          textAlign: "center",
        }}
      >
        <span>{loading ? "Redirecting..." : "Become a member"}</span>
      </button>

      {error && (
        <p
          className="text-sm italic mt-4 text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error === "stripe_not_configured"
            ? "Membership isn't live yet. Check back shortly."
            : error}
        </p>
      )}
    </div>
  );
}
