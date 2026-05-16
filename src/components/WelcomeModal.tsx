"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// One-time welcome modal shown on first /desk visit. Dismissal stored
// in localStorage, so it's device-scoped: signing in on a new device
// will re-show it. Acceptable for an intro screen.
//
// Renders nothing (and runs no effects against the DOM) until mounted,
// so server output stays empty and there's no hydration mismatch when
// the localStorage flag is set.
//
// Founder slot is passed from the server-rendered parent so the badge
// can render without a client fetch. Null for regular tier members
// (badge is skipped entirely).

const STORAGE_KEY = "sbp:welcomed";

type WelcomeModalProps = {
  founderSlot: number | null;
};

export function WelcomeModal({ founderSlot }: WelcomeModalProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // Storage blocked (private mode etc.). Show once per session
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

  const pillarLink =
    "font-display italic text-ink-muted hover:text-eye-deep no-underline transition-colors";

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
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative max-w-xl w-full">
        {/* Cat-eye corner ornaments */}
        <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye pointer-events-none z-10" />

        <div className="bg-paper border border-border max-h-[90vh] overflow-y-auto overflow-x-hidden welcome-modal-scroll">
          <div className="px-7 sm:px-9 py-8 sm:py-10">
            <p className="eyebrow mb-4">Welcome inside</p>
            <h2
              id="welcome-modal-title"
              className="font-display text-ink leading-[1.05] tracking-tight mb-6"
              style={{
                fontSize: "clamp(1.85rem, 4vw, 2.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.022em",
              }}
            >
              Welcome inside.
            </h2>

            {/* Founder badge. Renders only for the first-100 paid
                members. Single line, no price, dynamic slot number. */}
            {founderSlot !== null && (
              <div className="mb-6 flex">
                <div
                  className="member-chip member-chip-founder"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0.85rem 1.5rem",
                    fontSize: "0.95rem",
                    letterSpacing: "0.22em",
                    fontWeight: 600,
                  }}
                >
                  FOUNDER &#8470;{founderSlot}
                </div>
              </div>
            )}

            <p
              className="font-serif text-ink leading-relaxed mb-4"
              style={{ fontSize: "1.02rem" }}
            >
              You&apos;re in the room. Here&apos;s how it&apos;s organized:
            </p>

            {/* Single-line pillar descriptions. No em dashes. The
                Writer's Desk leads — it's where the primary CTA points
                and where Clay's live presence + recent work surfaces. */}
            <ul className="flex flex-col gap-2 mb-7 list-none p-0">
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>The Writer&apos;s Desk.</strong> Your home base. Clay&apos;s
                live status and the pulse of the room.
              </li>
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>Rules of Engagement.</strong> The doctrine. Eight rules.
              </li>
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>Case Files.</strong> Real engagements, dissected.
              </li>
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>Field Notes.</strong> My commentary on the work.
              </li>
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>The Lounge.</strong> Where operators talk.
              </li>
              <li
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                <strong>The Book.</strong> Manuscript progress, in public.
              </li>
            </ul>

            <div className="flex flex-col items-start gap-4">
              <button
                type="button"
                onClick={dismiss}
                className="btn-primary"
              >
                <span>start at the desk →</span>
              </button>

              {/* Secondary nav. Italic serif in publication register —
                  quieter than uppercase tracked nav, but each name is
                  still tappable. Hairline separators between, generous
                  line-height so a single-line wrap reads as graceful
                  rather than broken. */}
              <div
                className="flex flex-wrap items-baseline"
                style={{ rowGap: "0.35rem", columnGap: "0" }}
              >
                {[
                  { href: "/notes/rules", label: "Rules" },
                  { href: "/case-files", label: "Case Files" },
                  { href: "/notes/field-notes", label: "Field Notes" },
                  { href: "/lounge", label: "The Lounge" },
                  { href: "/book", label: "The Book" },
                ].map((item, idx, arr) => (
                  <span
                    key={item.href}
                    className="inline-flex items-baseline"
                  >
                    <Link
                      href={item.href}
                      onClick={dismiss}
                      className={pillarLink}
                      style={{
                        fontSize: "0.98rem",
                        fontWeight: 400,
                        letterSpacing: "0.005em",
                      }}
                    >
                      {item.label}
                    </Link>
                    {idx < arr.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="text-ink-faint not-italic"
                        style={{
                          fontSize: "0.78rem",
                          margin: "0 0.7rem",
                          opacity: 0.7,
                        }}
                      >
                        /
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-rule">
              <p
                className="font-serif italic text-ink-muted mb-3"
                style={{ fontSize: "0.9rem", lineHeight: 1.55 }}
              >
                Before you post or comment, set your display name in{" "}
                <Link
                  href="/notes/account"
                  onClick={dismiss}
                  className="text-eye-deep hover:text-ink not-italic"
                  style={{
                    textDecoration: "underline",
                    textDecorationColor: "var(--eye)",
                    textDecorationThickness: "1px",
                    textUnderlineOffset: "3px",
                    fontWeight: 500,
                  }}
                >
                  your account
                </Link>
                .
              </p>
              <p
                className="font-serif italic text-ink-muted mb-3"
                style={{ fontSize: "0.9rem", lineHeight: 1.55 }}
              >
                Then leave a line in{" "}
                <Link
                  href="/lounge"
                  onClick={dismiss}
                  className="text-eye-deep hover:text-ink not-italic"
                  style={{
                    textDecoration: "underline",
                    textDecorationColor: "var(--eye)",
                    textDecorationThickness: "1px",
                    textUnderlineOffset: "3px",
                    fontWeight: 500,
                  }}
                >
                  the Lounge
                </Link>
                . Who you are, what brought you in.
              </p>
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
