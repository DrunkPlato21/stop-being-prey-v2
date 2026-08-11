"use client";

import type { ReactNode } from "react";
import { useChrome } from "@/components/chrome";

// Client-side stand-ins for the old server-side isPaidViewer() checks
// on article pages. The static HTML (and every crawler) carries the
// public view; once /api/chrome resolves, paying members see their
// version. The swap sites live at the essay's foot and mid-body, well
// below the fold, so the correction lands before a member scrolls to
// them. This is what lets published articles prerender instead of
// paying for a server render per request (2026-08-10 scraper incident).

/** Renders children for everyone EXCEPT paying members. */
export function HideForPaid({ children }: { children: ReactNode }) {
  const chrome = useChrome();
  if (chrome?.isPaidMember) return null;
  return <>{children}</>;
}

/** Renders children ONLY for paying members (and the author). */
export function ShowForPaid({ children }: { children: ReactNode }) {
  const chrome = useChrome();
  if (!chrome?.isPaidMember) return null;
  return <>{children}</>;
}
