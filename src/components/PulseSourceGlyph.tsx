import type { PulseSource } from "@/lib/pulse";

// Tiny olive glyph that prefixes each pulse-row eyebrow on the Writer's
// Desk widget and in the /notes/activity and /notes/elsewhere
// archives, so the reader can tell sources apart at a glance without
// scanning the label text.

export function PulseSourceGlyph({ source }: { source: PulseSource }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    style: { flexShrink: 0, display: "inline-block" as const },
  };
  if (source === "x") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (source === "facebook") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103.34.04.717.105 1.141.195v3.325c-.16-.01-.327-.022-.495-.03-.166-.005-.246-.008-.733-.008-.707 0-1.259.096-1.675.309-.272.139-.493.34-.679.622-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647z" />
      </svg>
    );
  }
  if (source === "youtube") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    );
  }
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
