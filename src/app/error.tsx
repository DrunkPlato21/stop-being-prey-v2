"use client";

import { useEffect } from "react";
import Link from "next/link";

// Branded route error boundary. Without this file a throw in any server
// component drops the visitor on Next's default error screen: unstyled,
// off-brand, and on a paid site it reads as "this place is broken".
// Renders inside the root layout, so the nav and footer survive and the
// page still looks like the site.
//
// The digest is Next's own hash for the error, the only handle a reader
// has on what went wrong. Surfacing it means a member emailing about a
// problem can quote something that ties to the server logs, instead of
// "it didn't work". The error message itself is never shown: in
// production Next redacts it anyway, and it isn't a reader's problem.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-14 text-center">
          <p className="eyebrow mb-6">Something broke</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            That one is on me.
          </h1>
          <p className="deck max-w-xl mx-auto mb-10">
            This page failed to load. Nothing you did caused it, and nothing
            you wrote was lost. Try again, and if it keeps happening, tell me
            and I will go fix it.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button type="button" onClick={reset} className="btn-primary">
              <span>Try again</span>
            </button>
            <Link href="/" className="btn-secondary">
              Back to the work
            </Link>
          </div>
          {error.digest && (
            <p className="text-xs text-ink-faint mt-10">
              If you write in, include this code: {error.digest}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
