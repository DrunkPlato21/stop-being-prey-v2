import Link from "next/link";

// Preview clone of the member-area nav. Renders the same visual
// shell members see (small-caps Cormorant items, three clusters,
// olive accent on the active row, ornamental tail) so an
// unauthenticated visitor landing on a public-preview case file
// feels like they're already inside. Every link points at the
// membership sales page — the moment they try to navigate away
// from this single permitted page, the funnel converts.
//
// "Case Files" is marked active because the only place this nav
// renders is inside a public-preview case file detail page.
//
// Kept structurally parallel to MemberNav.tsx so visual updates
// to the real nav can be mirrored here with minimal drift.

type NavItem = {
  label: string;
  /** When true, render extra top-margin above this item on the
      desktop sidebar so it reads as the start of a new cluster.
      Mobile horizontal strip ignores this flag. */
  clusterBreak?: boolean;
  /** The one item that lights up as "you are here." Drives the
      olive border + color treatment on both surfaces. */
  active?: boolean;
};

const ITEMS: NavItem[] = [
  { label: "Desk" },
  { label: "Lounge" },
  { label: "Rules", clusterBreak: true },
  { label: "Field Notes" },
  { label: "Case Files", active: true },
  { label: "Book" },
  { label: "Account", clusterBreak: true },
];

const HREF = "/membership";

export function MemberNavPreview() {
  return (
    <>
      {/* === Mobile: sticky horizontal strip === */}
      <nav
        aria-label="Members area"
        className="md:hidden sticky top-0 z-20 bg-paper-deep/95 backdrop-blur-sm border-b border-rule"
      >
        <ul className="flex items-stretch justify-center max-w-3xl mx-auto px-2 overflow-x-auto">
          {ITEMS.map((item) => (
            <li key={item.label} className="flex">
              <Link
                href={HREF}
                className={
                  "font-display uppercase tracking-[0.22em] no-underline px-4 py-3 transition-colors whitespace-nowrap " +
                  (item.active
                    ? "text-eye-deep"
                    : "text-ink-muted hover:text-ink")
                }
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  borderBottom: item.active
                    ? "2px solid var(--eye-deep)"
                    : "2px solid transparent",
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* === Desktop: sticky vertical sidebar === */}
      <aside
        aria-label="Members area"
        className="hidden md:block md:w-[200px] md:shrink-0 md:sticky md:top-10 md:self-start md:pt-16"
      >
        <p
          className="eyebrow mb-6"
          style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
        >
          Members
        </p>
        <ul className="flex flex-col">
          {ITEMS.map((item) => (
            <li
              key={item.label}
              style={
                item.clusterBreak ? { marginTop: "1.1rem" } : undefined
              }
            >
              <Link
                href={HREF}
                className={
                  "block font-display uppercase tracking-[0.22em] no-underline py-2.5 pl-4 pr-3 transition-colors " +
                  (item.active
                    ? "text-eye-deep"
                    : "text-ink-muted hover:text-ink")
                }
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  borderLeft: item.active
                    ? "2px solid var(--eye-deep)"
                    : "2px solid var(--rule)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Ornamental tail. Mirrors MemberNav's three-dot rule so
            the preview reads as the same chrome. */}
        <p
          aria-hidden="true"
          className="font-display text-center select-none"
          style={{
            color: "var(--eye-deep)",
            fontSize: "1.1rem",
            letterSpacing: "0.6em",
            marginTop: "3rem",
            marginBottom: "1rem",
            paddingRight: "0.6em",
            opacity: 0.78,
          }}
        >
          &middot;&middot;&middot;
        </p>
      </aside>
    </>
  );
}
