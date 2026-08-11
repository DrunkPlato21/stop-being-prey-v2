import Link from "next/link";
import { HeaderChrome } from "@/components/HeaderChrome";
import { HeaderPublicNav } from "@/components/HeaderPublicNav";

// Static header shell. The viewer-dependent chrome (identity menu,
// bell, presence, JOIN) lives in HeaderChrome, which resolves itself
// client-side from /api/chrome — this component must stay free of
// cookies()/headers() so the pages that render it can be prerendered.
// It used to resolve session + identity + presence server-side, which
// made every route in the app dynamic and let a scraper bill us for
// ~36k server renders a day (the 2026-08-10 incident).

export function Header() {
  return (
    // Stacking context for the whole header so the identity dropdown
    // sits above any page section that creates its own stacking
    // context (e.g. .rules-paper with isolation: isolate). The sticky
    // scroll bar lives outside this header (rendered by the root
    // layout) so its position:fixed isn't trapped in this context.
    <header className="relative z-50">
      {/* === Tier 1: wordmark + Subscribe / identity ===
          Thin olive rule under the chrome separates header from
          page content. Kept faint so it reads as anchoring, not
          dividing. */}
      <div
        style={{ borderBottom: "1px solid rgba(138, 125, 32, 0.32)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
          <Link
            href="/"
            className="no-underline"
            aria-label="Stop Being Prey, home"
          >
            <span
              className="font-display tracking-tight text-ink whitespace-nowrap"
              style={{
                fontWeight: 700,
                letterSpacing: "-0.015em",
                fontSize: "clamp(1.15rem, 4.5vw, 1.4rem)",
              }}
            >
              Stop Being Prey
            </span>
          </Link>

          <HeaderChrome />
        </div>
      </div>

      {/* === Tier 2: the public site's nav strip ===
          Hidden in the member area (see HeaderPublicNav), where the
          member nav is the only nav. Membership isn't surfaced here — the
          Sign in / Join pair in Tier 1 already covers that entry point. */}
      <HeaderPublicNav />
    </header>
  );
}
