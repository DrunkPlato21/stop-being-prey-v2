"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useEmailReads } from "../useEmailReads";

// Wraps an email's body. A sentinel sits 85% of the way down (around the
// sign-off); once it has been on screen for a moment the email counts as
// read. Below the body, a quiet toggle for marking it either way by hand.
// Unmarking by hand wins for the rest of the visit: scrolling back past
// the sentinel won't quietly re-mark it.

const READ_AT = 0.85;
const DWELL_MS = 1200;

export function ReadTracker({
  kitId,
  initiallyRead,
  children,
}: {
  kitId: number;
  initiallyRead: boolean;
  children: ReactNode;
}) {
  const { read, setRead } = useEmailReads(initiallyRead ? [kitId] : []);
  const isRead = read.has(kitId);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const touchedByHand = useRef(false);
  const isReadRef = useRef(isRead);
  isReadRef.current = isRead;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (timer || isReadRef.current || touchedByHand.current) return;
        timer = setTimeout(() => {
          timer = null;
          if (!isReadRef.current && !touchedByHand.current) setRead(kitId, true);
        }, DWELL_MS);
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [kitId, setRead]);

  return (
    <>
      <div className="relative">
        {children}
        <span
          ref={sentinelRef}
          aria-hidden
          className="ar-read-sentinel"
          style={{ top: `${READ_AT * 100}%` }}
        />
      </div>
      <div className="ar-read-toggle">
        <button
          type="button"
          aria-pressed={isRead}
          className={isRead ? "is-read" : undefined}
          onClick={() => {
            touchedByHand.current = true;
            setRead(kitId, !isRead);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8.25" />
            {isRead && <path d="M6.2 10.4l2.6 2.6 5-5.4" />}
          </svg>
          <span>{isRead ? "Read" : "Mark as read"}</span>
          {isRead && <span className="ar-read-undo">Mark unread</span>}
        </button>
      </div>
    </>
  );
}
