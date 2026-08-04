"use client";

import { useEffect } from "react";

// Last resort. error.tsx renders inside the root layout, so it can't catch
// a throw in the root layout itself. This replaces the whole document when
// that happens, which is why it has to supply its own <html> and <body>.
//
// Everything here is inline: at this point the layout is gone and the
// stylesheet it imports may never have loaded, so class names would be
// meaningless. Plain markup in the site's colours is the only thing that
// can be relied on to render.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5efe1",
          color: "#1a1714",
          fontFamily: "Georgia, 'Times New Roman', serif",
          padding: "2rem 1.5rem",
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.24em",
              fontSize: "0.7rem",
              color: "#8a7d20",
              marginBottom: "1.5rem",
            }}
          >
            Something broke
          </p>
          <h1
            style={{
              fontSize: "clamp(2rem, 6vw, 3rem)",
              lineHeight: 1.05,
              fontWeight: 700,
              margin: "0 0 1.25rem",
            }}
          >
            That one is on me.
          </h1>
          <p
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.6,
              color: "#5c544c",
              margin: "0 0 2rem",
            }}
          >
            The site failed to load. Nothing you did caused it. Try again, and
            if it keeps happening, tell me and I will go fix it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontFamily: "inherit",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#f5efe1",
              background: "#8a7d20",
              border: "2px solid #8a7d20",
              borderRadius: "4px",
              padding: "0.7rem 1.4rem",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <p style={{ marginTop: "1.25rem" }}>
            <a href="/" style={{ color: "#8a7d20" }}>
              Back to the work
            </a>
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#8a8077",
                marginTop: "2.5rem",
              }}
            >
              If you write in, include this code: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
