"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { unlockRules, type UnlockState } from "./actions";
import { track } from "@/lib/track";
import { markSubscribed } from "@/lib/subscribed";

// The unlock gate that sits where rules II-VII would be for a stranger.
// Email is the free key, membership the real one. On a successful unlock
// the server action sets the cookie and revalidates /rules, so the page
// re-renders with the full bodies and this gate is gone — we just nudge
// the refresh and record the conversion. Copy is first-pass, Clay's to
// sharpen.

const INITIAL: UnlockState = { ok: false };

export function RulesGate({
  membershipCta,
}: {
  membershipCta: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(unlockRules, INITIAL);
  const fired = useRef(false);

  useEffect(() => {
    if (state.ok && !fired.current) {
      fired.current = true;
      track("sub_success", { source: "rules" });
      markSubscribed();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div
      className="rules-gate mt-2 px-6 py-9 md:px-10 md:py-11 text-center"
      style={{
        background: "var(--paper-deep)",
        borderTop: "2px solid var(--eye-deep)",
        borderBottom: "2px solid var(--eye-deep)",
      }}
    >
      <p
        className="eyebrow mb-5"
        style={{
          fontSize: "0.7rem",
          letterSpacing: "0.32em",
          fontWeight: 600,
          color: "var(--eye-deep)",
        }}
      >
        Locked &middot; six rules
      </p>
      <h2
        className="font-display text-ink leading-tight mb-5"
        style={{
          fontSize: "clamp(1.6rem, 3.2vw, 2.25rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        You&rsquo;ve seen the trap. Learn the rest.
      </h2>
      <p
        className="font-serif text-ink-soft max-w-xl mx-auto mb-7"
        style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
      >
        Rule one is the ground you keep losing on. Two through seven are how
        you take it back. Read them free. Drop your email and they open right
        here.
      </p>

      {state.ok ? (
        <p className="font-serif italic text-ink text-base leading-relaxed">
          Unlocked. Welcome to the doctrine.
        </p>
      ) : (
        <form
          action={formAction}
          onSubmit={() => track("sub_submit", { source: "rules" })}
          className="max-w-md mx-auto"
        >
          <div className="flex flex-col sm:flex-row gap-0 w-full border border-ink overflow-hidden">
            <input
              type="email"
              name="email_address"
              required
              disabled={pending}
              placeholder="your email address"
              className="flex-1 min-w-0 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60 border-0"
            />
            <button
              type="submit"
              disabled={pending}
              className="bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed border-0 shrink-0"
              style={{ fontWeight: 600 }}
            >
              {pending ? "Unlocking…" : "Unlock the rules"}
            </button>
          </div>
          {state.error && (
            <p
              className="mt-3 font-serif italic text-sm"
              style={{ color: "#7a3a2e" }}
            >
              {state.error}
            </p>
          )}
          <p className="text-xs italic text-ink-faint mt-3">
            Free. Unsubscribe anytime. We never share your email.
          </p>
        </form>
      )}

      {/* Membership path — the real key. Rendered server-side so the seat
          pricing tracks the live /membership state machine. */}
      {!state.ok && membershipCta && (
        <div className="mt-8 pt-7 border-t border-rule max-w-xl mx-auto">
          {membershipCta}
        </div>
      )}
    </div>
  );
}
