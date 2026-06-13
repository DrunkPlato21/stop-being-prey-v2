"use client";

import Link from "next/link";
import { useState } from "react";

// Client side of the gift redemption page. One button posts the token
// to /api/gift/redeem; the response state drives which landing the
// recipient sees. The already_member state exposes the pass-it-on form
// (POST /api/gift/forward). COPY IS PLACEHOLDER — Clay finalizes.

type State =
  | "idle"
  | "loading"
  | "granted"
  | "extended"
  | "already_member"
  | "already_redeemed"
  | "forwarded"
  | "error";

export function RedeemSeat({
  token,
  recipientEmail,
  alreadyRedeemed = false,
}: {
  token: string;
  recipientEmail: string;
  /** Server-rendered shortcut: the gift was claimed before this page
      loaded, so skip the button and show the sign-in pointer. */
  alreadyRedeemed?: boolean;
}) {
  const [state, setState] = useState<State>(
    alreadyRedeemed ? "already_redeemed" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [forwardEmail, setForwardEmail] = useState("");
  const [forwardBusy, setForwardBusy] = useState(false);

  async function handleRedeem() {
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data: { state?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "request_failed");
      if (
        data.state === "granted" ||
        data.state === "extended" ||
        data.state === "already_member" ||
        data.state === "already_redeemed"
      ) {
        setState(data.state);
      } else {
        throw new Error("request_failed");
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "request_failed");
    }
  }

  async function handleForward(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (forwardBusy) return;
    setForwardBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gift/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newRecipientEmail: forwardEmail }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "request_failed");
      setState("forwarded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setForwardBusy(false);
    }
  }

  if (state === "granted") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          You&apos;re in.
        </p>
        <p
          className="font-serif text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.02rem" }}
        >
          A sign-in link is on its way to{" "}
          <span className="font-display text-eye-deep">{recipientEmail}</span>.
          Click it and you land inside.
        </p>
        <p
          className="font-serif italic text-ink-muted leading-relaxed"
          style={{ fontSize: "0.9rem" }}
        >
          no card, no charge. the seat is paid for.
        </p>
      </div>
    );
  }

  if (state === "extended") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          Your seat just got longer.
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          You already held a gifted seat, so this one was added on top.
          Same room, more time.{" "}
          <Link href="/desk" className="text-eye-deep hover:text-ink">
            Back to the desk.
          </Link>
        </p>
      </div>
    );
  }

  if (state === "already_redeemed") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          This seat was already claimed.{" "}
          <Link
            href="/notes/sign-in"
            className="text-eye-deep hover:text-ink"
          >
            Sign in here.
          </Link>
        </p>
      </div>
    );
  }

  if (state === "forwarded") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          Passed on.
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          The seat is on its way to{" "}
          <span className="font-display text-eye-deep">{forwardEmail}</span>.
          Good pick.
        </p>
      </div>
    );
  }

  if (state === "already_member") {
    return (
      <div className="max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3 text-center"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          You&apos;re already in the room.
        </p>
        <p
          className="font-serif text-ink leading-relaxed mb-6 text-center"
          style={{ fontSize: "1.02rem" }}
        >
          This email holds its own membership, so the gifted seat is
          yours to give away. Put someone else in the room with it.
        </p>
        <form onSubmit={handleForward} className="flex flex-col sm:flex-row gap-0 border border-ink">
          <input
            type="email"
            required
            value={forwardEmail}
            onChange={(e) => setForwardEmail(e.target.value)}
            disabled={forwardBusy}
            placeholder="their email address"
            className="flex-1 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={forwardBusy}
            className="bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            {forwardBusy ? "Sending..." : "Pass it on"}
          </button>
        </form>
        {error && (
          <p
            className="mt-3 font-serif italic text-sm text-center"
            style={{ color: "#7a3a2e" }}
          >
            {error === "same_recipient"
              ? "that's the email it was already addressed to."
              : error === "invalid_email"
                ? "that email can't receive this seat. pick another."
                : "something went wrong. try again."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center max-w-md mx-auto">
      <button
        type="button"
        onClick={handleRedeem}
        disabled={state === "loading"}
        className="bg-ink text-paper hover:bg-eye-deep px-10 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {state === "loading" ? "Opening the door..." : "Take your seat"}
      </button>
      <p
        className="font-serif italic text-ink-faint mt-3"
        style={{ fontSize: "0.82rem" }}
      >
        the seat belongs to {recipientEmail}. no card, no charge.
      </p>
      {state === "error" && error && (
        <p
          className="mt-3 font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          something went wrong. try again, or reply to the gift email.
        </p>
      )}
    </div>
  );
}
