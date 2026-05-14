"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// One-time welcome modal shown on first /desk visit. Dismissal stored
// in localStorage, so it's device-scoped — signing in on a new device
// will re-show it. Acceptable for an intro screen.
//
// Renders nothing (and runs no effects against the DOM) until mounted,
// so server output stays empty and there's no hydration mismatch when
// the localStorage flag is set.
//
// Tier info (founderSlot + amount + interval) is passed in from the
// server-rendered parent so the founder badge can render without a
// client fetch. All three are optional — when null, we skip the badge.

const STORAGE_KEY = "sbp:welcomed";

function formatDollars(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

type WelcomeModalProps = {
  founderSlot: number | null;
  amountCents: number | null;
  interval: "month" | "year" | null;
};

export function WelcomeModal({
  founderSlot,
  amountCents,
  interval,
}: WelcomeModalProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // Storage blocked (private mode etc.) — show once per session
      // rather than nag every navigation.
      setOpen(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Can't persist; the next navigation will re-show. Fine.
    }
    setOpen(false);
  }

  // Prevent background scroll while open.
  useEffect(() => {
    if (!mounted) return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mounted, open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{
        background: "rgba(26, 23, 20, 0.55)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        // Click on the backdrop (not the panel) dismisses.
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      {/* Outer positioning wrapper holds the corner ornaments OUTSIDE
          the scroll container, so the absolutely-positioned -1px
          offsets never expand the inner element's scroll extent (which
          was producing both the horizontal scrollbar and an
          unnecessary vertical one). */}
      <div className="relative max-w-2xl w-full">
        {/* Cat-eye corner ornaments — pointer-events-none so they
            never intercept clicks from content beneath. */}
        <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye pointer-events-none z-10" />

        <div
          className="bg-paper border border-border max-h-[90vh] overflow-y-auto overflow-x-hidden welcome-modal-scroll"
        >
          <div className="px-7 sm:px-10 py-10 sm:py-12">
          <p className="eyebrow mb-5">Welcome inside</p>
          <h2
            id="welcome-modal-title"
            className="font-display text-ink leading-[1.1] tracking-tight mb-7"
            style={{
              fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Most people read political content. You&apos;re going to
            learn how to fight.
          </h2>

          {/* Founder badge — only renders for first-100 paid members.
              Same visual language as the success page block (filled
              olive interior, cream text, Cormorant uppercase with wide
              letter-spacing). Sized down a notch since the modal has
              less vertical room than a standalone page. */}
          {founderSlot !== null && amountCents !== null && interval !== null && (
            <div className="mb-8 flex">
              <div
                className="member-chip member-chip-founder"
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.4rem",
                  padding: "0.95rem 1.5rem",
                  fontSize: "0.85rem",
                  letterSpacing: "0.18em",
                  lineHeight: 1.35,
                  whiteSpace: "normal",
                }}
              >
                <span>
                  You&apos;re Founder{" "}
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "1.55em",
                      letterSpacing: 0,
                      textTransform: "none",
                      fontVariantNumeric: "lining-nums",
                      fontFeatureSettings: '"lnum" 1',
                    }}
                  >
                    №{founderSlot}
                  </span>
                  .
                </span>
                <span style={{ fontSize: "0.82em", opacity: 0.92 }}>
                  Locked at {formatDollars(amountCents)}/
                  {interval === "year" ? "yr" : "mo"} for life.
                </span>
              </div>
            </div>
          )}

          <div className="prose-article" style={{ fontSize: "1rem" }}>
            <p>
              Stop Being Prey is not a magazine. It&apos;s a contract.
              You support the work. I owe you everything I have.
            </p>
            <p>
              <strong>Rules of Engagement</strong>
              {" "}are the doctrine. Eight rules. Memorize them. They
              explain every political conversation you&apos;ve ever
              lost.
            </p>
            <p>
              <strong>Case Files</strong>
              {" "}are the reps. Real Facebook comments, Twitter
              threads, reader emails, taken apart move by move. The
              rules in action against actual opponents. You watch, you
              learn, you start doing it yourself.
            </p>
            <p>
              <strong>Field Notes</strong>
              {" "}are the back room. My commentary on the work as I
              make it. The moves that didn&apos;t make the essays. The
              thinking out loud, the processing in public, the
              writer&apos;s view from inside the project.
            </p>
            <p>
              <strong>The Lounge</strong>
              {" "}is where the operators talk. Members only. The room
              you walk into when you want to be among people who think
              like you.
            </p>
            <p>
              Read all of it. Rules without case files is theory you
              can&apos;t apply. Case files without rules is
              entertainment. Field notes are how you watch the
              doctrine being built in front of you. Together,
              they&apos;re how you stop being prey.
            </p>
          </div>

          {/* Primary CTA — START AT THE DESK. The modal lives on /desk
              already, so the button just dismisses. Secondary links
              point at the four pillars for members who want to wander
              instead of starting at the desk. */}
          <div className="mt-8 flex flex-col items-start gap-5">
            <button
              type="button"
              onClick={dismiss}
              className="btn-primary"
            >
              <span>start at the desk →</span>
            </button>

            <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
              <Link
                href="/notes/rules"
                onClick={dismiss}
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                rules →
              </Link>
              <Link
                href="/case-files"
                onClick={dismiss}
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                case files →
              </Link>
              <Link
                href="/notes/field-notes"
                onClick={dismiss}
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                field notes →
              </Link>
              <Link
                href="/lounge"
                onClick={dismiss}
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                lounge →
              </Link>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-rule">
            <p
              className="font-serif italic text-ink-muted"
              style={{ fontSize: "0.95rem" }}
            >
              See you in the work. ~ Clay
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
