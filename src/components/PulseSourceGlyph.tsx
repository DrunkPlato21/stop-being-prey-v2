import type { PulseSource } from "@/lib/pulse";

// Tiny olive glyph that prefixes each pulse-row eyebrow on the Writer's
// Desk widget and in the /notes/activity archive, so the reader can
// tell sources apart at a glance without scanning the label text.
// (The social glyphs left with the Elsewhere retirement, 2026-08-08.)

export function PulseSourceGlyph({ source }: { source: PulseSource }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    style: { flexShrink: 0, display: "inline-block" as const },
  };
  if (source === "issue") {
    return (
      <svg
        {...common}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
      >
        <line x1="10" y1="3" x2="6" y2="21" />
        <line x1="18" y1="3" x2="14" y2="21" />
        <line x1="3.5" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="20.5" y2="15" />
      </svg>
    );
  }
  if (source === "field-note") {
    return (
      <svg
        {...common}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <line x1="7" y1="4" x2="7" y2="20" />
        <line x1="11" y1="9" x2="17" y2="9" />
        <line x1="11" y1="13" x2="17" y2="13" />
        <line x1="11" y1="17" x2="15" y2="17" />
      </svg>
    );
  }
  if (source === "case-file") {
    return (
      <svg
        {...common}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
        <line x1="6" y1="13" x2="18" y2="13" />
        <line x1="6" y1="16" x2="14" y2="16" />
      </svg>
    );
  }
  if (source === "guild") {
    // The watchful eye — the Guild's mark, reduced to a glyph: an almond
    // outline with a struck pupil, same eye motif as the crest.
    return (
      <svg
        {...common}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // essay
  return (
    <svg
      {...common}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}
