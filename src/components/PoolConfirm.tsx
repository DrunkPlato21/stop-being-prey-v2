"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Client side of the pool confirm page. Auto-posts the token to
// /api/pool/confirm on mount (the click on the email link IS the
// confirmation) and renders the outcome. This is the moment a seat is
// actually taken or a place in line is held. COPY IS DRAFT — Clay
// finalizes.

type State =
  | "loading"
  | "granted"
  | "waitlisted"
  | "already_granted"
  | "already_waiting"
  | "already_member"
  | "expired"
  | "error";

export function PoolConfirm({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [termLabel, setTermLabel] = useState<string | null>(null);
  // Strict mode double-invokes effects in dev; guard so we POST once.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        const res = await fetch("/api/pool/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data: {
          state?: string;
          termLabel?: string | null;
          error?: string;
        } = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "request_failed");
        if (typeof data.termLabel === "string") setTermLabel(data.termLabel);
        if (
          data.state === "granted" ||
          data.state === "waitlisted" ||
          data.state === "already_granted" ||
          data.state === "already_waiting" ||
          data.state === "already_member" ||
          data.state === "expired"
        ) {
          setState(data.state);
        } else {
          throw new Error("request_failed");
        }
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  if (state === "loading") {
    return (
      <p
        className="font-serif italic text-ink-muted text-center"
        style={{ fontSize: "1.02rem" }}
      >
        Confirming...
      </p>
    );
  }

  if (state === "granted" || state === "already_granted") {
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
          A reader covered your seat{termLabel ? ` for ${termLabel}` : ""}. A
          sign-in link is on its way to your inbox. Click it and you land
          inside.
        </p>
        <p
          className="font-serif italic text-ink-muted leading-relaxed"
          style={{ fontSize: "0.9rem" }}
        >
          no card, no charge. when you&apos;re able, put the next person in.
        </p>
      </div>
    );
  }

  if (state === "waitlisted" || state === "already_waiting") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          You&apos;re in line.
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          Every seat is funded by another reader, so there isn&apos;t one
          free this second. The moment the next one is funded, it&apos;s
          yours, and we&apos;ll email you. Nothing more to do.
        </p>
      </div>
    );
  }

  if (state === "already_member") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          You already have a way in.{" "}
          <Link href="/notes/sign-in" className="text-eye-deep hover:text-ink">
            Sign in here.
          </Link>
        </p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          This link has expired.{" "}
          <Link href="/membership/pool" className="text-eye-deep hover:text-ink">
            Ask for a seat again
          </Link>{" "}
          and we&apos;ll send a fresh one.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center max-w-md mx-auto">
      <p
        className="font-serif italic text-sm"
        style={{ color: "#7a3a2e" }}
      >
        Something went wrong confirming your seat. Try the link again, or
        reply to the email it came in.
      </p>
    </div>
  );
}
