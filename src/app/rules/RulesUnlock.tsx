"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { unlockRules, type UnlockState } from "./actions";
import { track } from "@/lib/track";
import { markSubscribed } from "@/lib/subscribed";

// The unlock ask, inline at the seam between the free rule and the locked
// ones — right in the reading path, where intent peaks, so nothing has to
// point the eye to it. Email reveals the bodies inline (the action sets the
// cookie + revalidates /rules). Copy is first-pass, Clay's to sharpen.

const INITIAL: UnlockState = { ok: false };

export function RulesUnlock() {
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
      className="my-10 px-6 py-8 md:px-10 md:py-9 text-center"
      style={{
        background: "var(--paper-deep)",
        borderTop: "2px solid var(--eye-deep)",
        borderBottom: "2px solid var(--eye-deep)",
      }}
    >
      <p
        className="eyebrow mb-4"
        style={{
          fontSize: "0.8rem",
          letterSpacing: "0.3em",
          fontWeight: 600,
          color: "var(--eye-deep)",
        }}
      >
        The other six are locked
      </p>
      <p
        className="font-serif text-ink-soft max-w-md mx-auto mb-6"
        style={{ fontSize: "1.05rem", lineHeight: 1.6 }}
      >
        Read them free. Drop your email and they open right here.
      </p>
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
            aria-label="Email address"
            className="flex-1 min-w-0 bg-paper px-4 py-3.5 text-ink placeholder:text-ink-faint focus:outline-none font-serif text-base border-0 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending}
            className="bg-ink text-paper hover:bg-eye-deep px-6 py-3.5 font-display uppercase tracking-widest text-sm font-semibold whitespace-nowrap border-0 disabled:opacity-60"
          >
            {pending ? "Unlocking…" : "Unlock"}
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
          Free. Members read everything. Unsubscribe anytime.
        </p>
      </form>
    </div>
  );
}
