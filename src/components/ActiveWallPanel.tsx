"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ActiveWallSnapshot } from "@/lib/active-wall";

// Active Wall panel for the Writer's Desk widget. The polling loop in
// WritersDeskView keeps `snapshot` fresh — this component's only job
// is to render it as a card and flash a brief highlight when the
// raised total or contributor count moves between polls.

function formatDollars(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

function contributorsLabel(n: number): string {
  if (n === 0) return "no contributors yet";
  if (n === 1) return "1 contributor";
  return `${n.toLocaleString("en-US")} contributors`;
}

/**
 * Watches `value` and returns true for ~1.4s after it changes. Skips
 * the initial mount so the highlight only fires on *changes* observed
 * by the polling loop, not first paint.
 */
function useChangeFlash<T>(value: T, holdMs = 1400): boolean {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef<T>(value);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = value;
      return;
    }
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlashing(true);
      const id = window.setTimeout(() => setFlashing(false), holdMs);
      return () => window.clearTimeout(id);
    }
  }, [value, holdMs]);
  return flashing;
}

export function ActiveWallPanel({
  snapshot,
}: {
  snapshot: ActiveWallSnapshot;
}) {
  const raisedFlash = useChangeFlash(snapshot.totalRaisedCents);
  const contributorFlash = useChangeFlash(snapshot.contributorCount);
  const isActive = snapshot.status === "active";

  return (
    <article className="active-wall-card" data-status={snapshot.status}>
      <header className="active-wall-header">
        <h3 className="active-wall-title">{snapshot.title}</h3>
        {snapshot.description && (
          <p className="active-wall-desc">{snapshot.description}</p>
        )}
      </header>

      <p className="active-wall-stats">
        <span
          className={
            "active-wall-amount" +
            (raisedFlash ? " active-wall-flash" : "")
          }
        >
          {formatDollars(snapshot.totalRaisedCents)}
        </span>
        <span className="active-wall-amount-trail"> raised</span>
        <span className="active-wall-sep" aria-hidden="true">
          ·
        </span>
        <span
          className={
            "active-wall-stat-text" +
            (contributorFlash ? " active-wall-flash" : "")
          }
        >
          {contributorsLabel(snapshot.contributorCount)}
        </span>
        <span className="active-wall-sep" aria-hidden="true">
          ·
        </span>
        <span
          className="active-wall-status-text"
          data-state={isActive ? "active" : "closed"}
        >
          {isActive && (
            <span
              className="active-wall-status-dot"
              aria-hidden="true"
            />
          )}
          <span>{snapshot.daysLabel}</span>
        </span>
      </p>

      <div className="active-wall-cta-row">
        <Link href={snapshot.url} className="btn-secondary">
          <span>
            {isActive ? "View the wall" : "See the final wall"}{" "}
            <span aria-hidden="true">&rarr;</span>
          </span>
        </Link>
        {snapshot.otherActiveCount > 0 && (
          <Link href="/walls" className="active-wall-more">
            +&nbsp;{snapshot.otherActiveCount} more
          </Link>
        )}
      </div>
    </article>
  );
}
