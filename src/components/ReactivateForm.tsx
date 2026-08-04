"use client";

import Link from "next/link";
import { useState } from "react";

// Reactivation form for a lapsed member. Email in, and if there's a
// membership to revive it redirects to Stripe Checkout to add a new card
// at the member's locked rate (founder slot preserved server-side). The
// non-redirect states explain why there's nothing to reactivate.
// COPY IS DRAFT — Clay finalizes.

type State =
  | "idle"
  | "loading"
  | "not_found"
  | "already_active"
  | "no_subscription"
  | "update_card"
  | "error";

export function ReactivateForm({
  initialEmail = "",
}: {
  // The lapsed-membership email links here with ?email= already filled,
  // so coming back is one click at the moment they're least inclined to
  // type anything.
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<State>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { url?: string; state?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (
        data.state === "not_found" ||
        data.state === "already_active" ||
        data.state === "no_subscription" ||
        data.state === "update_card"
      ) {
        setState(data.state);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "already_active") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          Good news, your membership is already active.{" "}
          <Link href="/notes/sign-in" className="text-eye-deep hover:text-ink">
            Sign in here.
          </Link>
        </p>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.02rem" }}
        >
          We couldn&apos;t find a membership under that email. Check the
          address, or start fresh.
        </p>
        <Link href="/membership?src=reactivate" className="text-eye-deep hover:text-ink">
          See membership
        </Link>
      </div>
    );
  }

  if (state === "update_card") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.02rem" }}
        >
          Your seat isn&apos;t gone, it just needs a fresh card. Sign in and
          update it, and your subscription picks right back up, no new
          checkout needed.
        </p>
        <Link href="/notes/sign-in" className="text-eye-deep hover:text-ink">
          Sign in to update your card
        </Link>
      </div>
    );
  }

  if (state === "no_subscription") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          That seat wasn&apos;t on a card subscription, so there&apos;s
          nothing to reactivate. Reply to any email from Clay and he&apos;ll
          sort it out.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <label className="block mb-6">
        <span className="eyebrow block mb-2">your email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "loading"}
          placeholder="the address on your membership"
          className="w-full border border-ink bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={state === "loading"}
        className="w-full bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {state === "loading" ? "One moment..." : "Reactivate my seat"}
      </button>

      <p
        className="font-serif italic text-ink-faint text-center mt-3"
        style={{ fontSize: "0.82rem" }}
      >
        you&apos;ll add a card and come back at your locked rate. nothing
        changes about your standing.
      </p>

      {state === "error" && (
        <p
          className="mt-3 font-serif italic text-sm text-center"
          style={{ color: "#7a3a2e" }}
        >
          something went wrong. try again in a moment.
        </p>
      )}
    </form>
  );
}
