import Link from "next/link";

// Preview clone of the member-area nav. Renders the same visual
// shell members see (small-caps Cormorant items, two clusters,
// olive accent on the active row) so an unauthenticated visitor
// landing on a public-preview case feels like they're already
// inside. Every link points at the membership sales page — the
// moment they try to navigate away from this single permitted
// page, the funnel converts.
//
// Kept structurally parallel to MemberNav.tsx: same labels, same
// order, same cluster break. It is a sales asset, so drift is not
// cosmetic. A preview listing rooms that do not exist sells a
// member area the buyer will not find.

type NavItem = {
  label: string;
  /** When true, render extra top-margin above this item on the
      desktop sidebar so it reads as the start of a new cluster.
      Mobile horizontal strip ignores this flag. */
  clusterBreak?: boolean;
};

// Mirrors MemberNav's ITEMS exactly: same labels, same order, same
// cluster break. It had drifted badly — Field Notes and Account had
// been gone from the real nav for a while, The Guild and The Arena had
// never arrived, and "Case Files" was the lit item on a page that IS
// an Arena case. A stranger's first look at the member area was a menu
// of rooms that do not exist, with the wrong one glowing.
//
// Which item lights up is a property of the page doing the rendering,
// not of this list — two surfaces share this nav (/arena and
// /case-files), so the caller names it.
const ITEMS: NavItem[] = [
  { label: "Desk" },
  { label: "The Arena" },
  { label: "The Guild" },
  { label: "Lounge" },
  { label: "Rules", clusterBreak: true },
  { label: "Book" },
];

const HREF = "/membership";

export function MemberNavPreview({
  active = "The Arena",
}: {
  /** Label of the item to light as "you are here." Both current
      callers are Arena-world pages: the room itself, and the retired
      case files the room's index shelves. */
  active?: string;
} = {}) {
  const isActive = (label: string) => label === active;
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
                  (isActive(item.label)
                    ? "text-eye-deep"
                    : "text-ink-muted hover:text-ink")
                }
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  borderBottom: isActive(item.label)
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
                  (isActive(item.label)
                    ? "text-eye-deep"
                    : "text-ink-muted hover:text-ink")
                }
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  borderLeft: isActive(item.label)
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
      </aside>
    </>
  );
}
