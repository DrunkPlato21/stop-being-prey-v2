/* eslint-disable @next/next/no-img-element */

"use client";

import { useState } from "react";

// Cover image with multiple fallback layers:
//   1. coverUrl (admin upload via /admin/book → Vercel Blob)
//   2. Static optimized WebP / JPG at /book-cover.{webp,jpg}
//   3. Cream tile with serif title (renders if both above fail to
//      load, or in tests where the static asset isn't present)
//
// Sizes:
//   "thumb"  ~96px wide, used in any compact widget surfaces.
//   "hero"   ~280px wide, used on /book.

const STATIC_WEBP = "/book-cover.webp";
const STATIC_JPG = "/book-cover.jpg";

export function BookCover({
  coverUrl,
  title,
  size = "thumb",
  alt,
}: {
  coverUrl: string | null;
  title: string;
  size?: "thumb" | "hero";
  alt?: string;
}) {
  const dims =
    size === "thumb"
      ? { width: 96, height: 144, fontSize: "0.78rem" }
      : { width: 280, height: 420, fontSize: "1.45rem" };

  const [failed, setFailed] = useState(false);

  // Path 1: admin-uploaded cover wins.
  if (coverUrl && !failed) {
    return (
      <img
        src={coverUrl}
        alt={alt ?? `${title} cover`}
        onError={() => setFailed(true)}
        style={{
          width: dims.width,
          height: "auto",
          maxHeight: dims.height * 1.6,
          display: "block",
          boxShadow:
            size === "thumb"
              ? "0 4px 12px rgba(60, 46, 22, 0.18)"
              : "0 8px 28px rgba(60, 46, 22, 0.22)",
        }}
      />
    );
  }

  // Path 2: static optimized fallback. WebP preferred, JPG for old
  // browsers. onError flips to the cream placeholder if neither
  // resolve.
  if (!failed) {
    return (
      <picture>
        <source srcSet={STATIC_WEBP} type="image/webp" />
        <img
          src={STATIC_JPG}
          alt={alt ?? `${title} cover`}
          onError={() => setFailed(true)}
          style={{
            width: dims.width,
            height: "auto",
            maxHeight: dims.height * 1.6,
            display: "block",
            boxShadow:
              size === "thumb"
                ? "0 4px 12px rgba(60, 46, 22, 0.18)"
                : "0 8px 28px rgba(60, 46, 22, 0.22)",
          }}
        />
      </picture>
    );
  }

  // Path 3: cream placeholder failsafe.
  return (
    <div
      role="img"
      aria-label={alt ?? `${title} cover, coming soon`}
      style={{
        width: dims.width,
        height: dims.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: size === "thumb" ? "0.6rem" : "1.5rem",
        background: "var(--paper-deep)",
        border: "1px solid var(--rule)",
        boxShadow:
          size === "thumb"
            ? "0 4px 12px rgba(60, 46, 22, 0.12)"
            : "0 8px 28px rgba(60, 46, 22, 0.16)",
      }}
    >
      <span
        className="font-display text-ink leading-tight"
        style={{
          fontSize: dims.fontSize,
          fontWeight: 700,
          letterSpacing: "-0.012em",
        }}
      >
        {title}
      </span>
    </div>
  );
}
