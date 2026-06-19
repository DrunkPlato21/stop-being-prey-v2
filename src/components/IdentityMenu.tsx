"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MemberBadge } from "@/components/MemberBadge";
import type { TierBadge } from "@/lib/members";

// Identity dropdown in the site header. Replaces the bare link to
// /notes/account with a small menu that surfaces member metadata
// (member-since, founder slot, tier) and the actions members
// actually need from the chrome: Writer's Desk, account/billing,
// and sign-out.
//
// The trigger lives in the header's normal flow. The menu itself is
// rendered via createPortal into <body> with position: fixed and
// anchored to the trigger's bounding rect. This is the only way to
// guarantee the menu paints above page content that creates its own
// stacking context — the Writer's Desk widget on /desk, the
// .rules-paper isolation context on /rules, etc. — without
// playing whack-a-mole with z-index values up the tree.
//
// Closing rules:
//   - click outside (handled via two refs: trigger + menu)
//   - press Escape (returns focus to trigger)
//   - click any item inside the menu

export type IdentityMenuProps = {
  firstName: string;
  role: "author" | "founder" | "charter" | "member";
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
  displayName: string;
  email: string;
  memberSinceMs: number | null;
  avatarUrl: string | null;
};

function roleLabel(props: IdentityMenuProps): string {
  if (props.role === "author") return "Author";
  if (props.role === "founder" && typeof props.founderSlot === "number") {
    return `Founder #${props.founderSlot}`;
  }
  if (props.role === "charter" && typeof props.charterSlot === "number") {
    return `Charter #${props.charterSlot}`;
  }
  return "Member";
}

function initials(displayName: string, fallback: string): string {
  const source = displayName.trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatMemberSince(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

type AnchorPos = { top: number; right: number };

export function IdentityMenu(props: IdentityMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<AnchorPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Portals require document.body; mount-gate so SSR doesn't blow up.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute the menu's fixed-position anchor from the trigger's
  // bounding rect. Re-runs on open, scroll (capture phase, to catch
  // nested scroll containers), and resize.
  useEffect(() => {
    if (!open) return;
    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Click outside + Escape close the menu. Click-outside checks both
  // the trigger and the portal'd menu, since they aren't in the same
  // DOM subtree.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = roleLabel(props);
  const initialsText = initials(props.displayName, props.firstName);

  const menu = open && mounted && pos !== null
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            zIndex: 1000,
            minWidth: 240,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
          }}
        >
          {/* Member metadata header. */}
          <div
            className="px-4 py-3 border-b border-rule"
            style={{ background: "var(--paper-deep)" }}
          >
            <p
              className="font-display text-ink leading-tight"
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                letterSpacing: "-0.005em",
              }}
            >
              {props.displayName || props.firstName}
            </p>
            <p
              className="font-serif italic text-ink-faint mt-0.5"
              style={{ fontSize: "0.78rem" }}
            >
              {props.email}
            </p>
            <ul className="flex flex-col mt-2" style={{ gap: "0.35rem" }}>
              <li className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-display uppercase text-eye-deep"
                  style={{
                    fontSize: "0.6rem",
                    letterSpacing: "0.22em",
                    fontWeight: 600,
                  }}
                >
                  Tier
                </span>
                {props.founderSlot !== null ||
                props.charterSlot !== null ||
                props.tierBadge !== null ? (
                  <MemberBadge
                    founderSlot={props.founderSlot}
                    charterSlot={props.charterSlot}
                    tierBadge={props.tierBadge}
                    size="small"
                  />
                ) : (
                  <span
                    className="font-serif text-ink"
                    style={{ fontSize: "0.86rem" }}
                  >
                    {label}
                  </span>
                )}
              </li>
              {props.memberSinceMs !== null && (
                <li>
                  <span
                    className="font-display uppercase text-eye-deep mr-2"
                    style={{
                      fontSize: "0.6rem",
                      letterSpacing: "0.22em",
                      fontWeight: 600,
                    }}
                  >
                    Member since
                  </span>
                  <span
                    className="font-serif text-ink"
                    style={{ fontSize: "0.86rem" }}
                  >
                    {formatMemberSince(props.memberSinceMs)}
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Actions — Writer's Desk first (primary destination of the
              membership), then Account & billing. */}
          <Link
            href="/desk"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="identity-menu-item flex items-center justify-between gap-4 px-4 py-3 no-underline"
            style={{
              fontFamily:
                "var(--font-source-serif), Georgia, 'Times New Roman', serif",
              color: "var(--ink)",
              fontSize: "0.95rem",
            }}
          >
            <span>Writer&apos;s Desk</span>
            <span
              aria-hidden="true"
              style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}
            >
              &rarr;
            </span>
          </Link>

          <Link
            href="/notes/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="identity-menu-item flex items-center justify-between gap-4 px-4 py-3 no-underline border-t border-rule"
            style={{
              fontFamily:
                "var(--font-source-serif), Georgia, 'Times New Roman', serif",
              color: "var(--ink)",
              fontSize: "0.95rem",
            }}
          >
            <span>Account &amp; billing</span>
            <span
              aria-hidden="true"
              style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}
            >
              &rarr;
            </span>
          </Link>

          <Link
            href="/notes/coins"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="identity-menu-item flex items-center justify-between gap-4 px-4 py-3 no-underline border-t border-rule"
            style={{
              fontFamily:
                "var(--font-source-serif), Georgia, 'Times New Roman', serif",
              color: "var(--ink)",
              fontSize: "0.95rem",
            }}
          >
            <span>Your Coins</span>
            <span
              aria-hidden="true"
              style={{ color: "var(--ink-faint)", fontSize: "0.85rem" }}
            >
              &rarr;
            </span>
          </Link>

          <form
            method="post"
            action="/api/auth/logout"
            className="border-t border-rule"
          >
            <button
              type="submit"
              role="menuitem"
              className="identity-menu-item flex items-center w-full px-4 py-3 text-left"
              style={{
                fontFamily:
                  "var(--font-source-serif), Georgia, 'Times New Roman', serif",
                color: "var(--ink)",
                fontSize: "0.95rem",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </form>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Your account: ${props.firstName}, ${label}`}
        className="header-identity header-identity-trigger flex items-center gap-2.5 whitespace-nowrap overflow-hidden"
        style={{
          maxWidth: "55vw",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          padding: "0.25rem 0.55rem",
          borderRadius: 999,
        }}
      >
        <span
          aria-hidden="true"
          className="header-identity-avatar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: props.avatarUrl
              ? `center / cover no-repeat url(${JSON.stringify(props.avatarUrl)})`
              : "var(--paper)",
            border: "1px solid var(--eye-deep)",
            color: "var(--eye-deep)",
            fontFamily:
              "var(--font-cormorant), 'EB Garamond', Georgia, serif",
            fontSize: "0.85rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          {!props.avatarUrl && initialsText}
        </span>

        <span
          className="font-display uppercase text-eye-deep overflow-hidden text-ellipsis"
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            letterSpacing: "0.22em",
          }}
        >
          {props.firstName}
        </span>

        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            lineHeight: 1,
            fontSize: "0.52rem",
            color: "var(--eye-deep)",
            opacity: 0.55,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
            flexShrink: 0,
          }}
        >
          &#9662;
        </span>
      </button>
      {menu}
    </>
  );
}
