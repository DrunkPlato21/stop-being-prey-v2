"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { computeReadingProgress } from "@/lib/reading-progress";
import { registerFinish } from "@/lib/finisher";
import { track } from "@/lib/track";

// Finisher Achievement. Mounts NOTHING until the reader genuinely reaches
// the end of #reading-region (the same scroll_100 signal ReadingTracker
// uses). On finish it materializes two things, so arriving IS the reward:
//   1. a non-blocking achievement toast (portal, auto-dismisses, never
//      traps the reader — no modal, ever)
//   2. an inline end-of-article block that animates into the content flow
//
// Recognition recurs on every finish. The membership ask is non-members
// only and cadence-capped (see lib/finisher). Members are celebrated and
// never pitched something they already own.
//
// All copy here is PLACEHOLDER for Clay to finalize in his voice.

const TOAST_ENTER_MS = 520;
const TOAST_HOLD_MS = 5200;
const TOAST_EXIT_MS = 460;

const TOAST_LINE = "You read the whole thing. In this economy.";
const RECOGNITION =
  "Only about half who start a piece this long finish it. You did.";

function memberLine(count: number): string {
  return count > 1 ? `Another one down. ${count} finished.` : "Another one down.";
}

// Finalized non-member ask (Clay's voice). One ask line now; the cadence
// cap in lib/finisher still governs how OFTEN it shows, and the stored
// finish-count stays available for a future escalation/streak layer.
// (Em dash from the source copy swapped to periods per the no-em-dash rule.)
const ASK_LINE =
  "You read to the end. So does everyone in the room. The members-only conversation you won't find anywhere else. You just proved you belong in it. Take your seat, and you keep the whole thing alive while you're at it.";
const ASK_CTA = "Take a seat";

type Resolved = { count: number; showAsk: boolean };

function Badge() {
  return (
    <span className="finisher-badge" aria-hidden="true">
      <span className="finisher-badge-mark">&#10038;</span>
      <span className="finisher-shimmer" />
    </span>
  );
}

function AchievementToast({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t1 = window.setTimeout(
      () => setShown(false),
      TOAST_ENTER_MS + TOAST_HOLD_MS
    );
    const t2 = window.setTimeout(
      onDone,
      TOAST_ENTER_MS + TOAST_HOLD_MS + TOAST_EXIT_MS
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`finisher-toast${shown ? " finisher-toast--show" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Badge />
      <span className="finisher-toast-text">
        <span className="finisher-toast-eyebrow">Achievement unlocked</span>
        <span className="finisher-toast-line">{TOAST_LINE}</span>
      </span>
    </div>,
    document.body
  );
}

function FinisherAsk({ slug }: { slug: string }) {
  return (
    <div className="finisher-ask">
      <p className="finisher-ask-line">{ASK_LINE}</p>
      <Link
        href="/membership?src=finisher"
        className="btn-primary finisher-ask-cta"
        onClick={() =>
          track("checkout_started", { slug, source: "finisher" })
        }
      >
        <span>{ASK_CTA}</span>
      </Link>
    </div>
  );
}

function FinisherInline({
  isMember,
  resolved,
  slug,
}: {
  isMember: boolean;
  resolved: Resolved;
  slug: string;
}) {
  return (
    <aside className="finisher-inline" aria-label="Reading achievement">
      <Badge />
      <p className="finisher-inline-eyebrow">Achievement unlocked</p>
      <p className="finisher-inline-recognition">{RECOGNITION}</p>
      {isMember ? (
        <p className="finisher-inline-member">{memberLine(resolved.count)}</p>
      ) : resolved.showAsk ? (
        <FinisherAsk slug={slug} />
      ) : null}
    </aside>
  );
}

export function FinisherAchievement({
  slug,
  isMember,
  regionId = "reading-region",
}: {
  slug: string;
  isMember: boolean;
  regionId?: string;
}) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const region = document.getElementById(regionId);
    if (!region) return;

    let ticking = false;
    const cleanup = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    const finish = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      const r = registerFinish(slug, isMember);
      track("achievement_shown", { slug });
      if (r.showAsk) track("ask_shown", { slug, source: "finisher" });
      setResolved(r);
      setToastOpen(true);
      cleanup();
    };

    const evaluate = () => {
      ticking = false;
      if (computeReadingProgress(region) >= 1) finish();
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Evaluate once: a very short piece may already be fully read.
    evaluate();

    return cleanup;
  }, [slug, isMember, regionId]);

  if (!resolved) return null;

  return (
    <>
      {toastOpen && <AchievementToast onDone={() => setToastOpen(false)} />}
      <FinisherInline isMember={isMember} resolved={resolved} slug={slug} />
    </>
  );
}
