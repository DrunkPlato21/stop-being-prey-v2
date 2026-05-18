import type { Metadata } from "next";
import { listPresenceSnapshot, summarizeBySection } from "@/lib/presence";
import { PresencePanel } from "@/components/PresencePanel";

// /admin/presence — site-wide "who's on the site right now" panel.
//
// Server-renders the initial snapshot (5-minute window) so the page
// has live data on first paint, then hands it to PresencePanel which
// auto-refreshes via /api/admin/presence every 20s.
//
// Gated by proxy.ts (HTTP Basic auth on /admin/*). Admin (Clay) is
// already excluded by the presence-ping endpoint, so this panel only
// ever surfaces real member traffic.

export const metadata: Metadata = {
  title: "Presence",
};

export const dynamic = "force-dynamic";

// Matches the OnTheDeskBadge's window so the two indicators agree.
// A member who shows up on /admin/desk's "On the desk" pill should
// also show on this panel — anything tighter (e.g. 5 min) made the
// panel look empty while the desk badge still surfaced live members.
const WINDOW_MINUTES = 30;

export default async function PresenceAdminPage() {
  const now = Date.now();
  const sinceMs = now - WINDOW_MINUTES * 60 * 1000;
  const entries = await listPresenceSnapshot(sinceMs, now);
  const sections = summarizeBySection(entries);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
      {/* === Masthead ============================================ */}
      <header className="mb-10 md:mb-12">
        <p className="eyebrow mb-3">Live</p>
        <h1
          className="font-display text-ink leading-tight tracking-tight"
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Who&apos;s on the site.
        </h1>
        <p
          className="font-serif italic text-ink-muted mt-2"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        >
          Every signed-in member, where they are right now. Anonymous
          visitors and Clay are not counted.
        </p>
      </header>

      <PresencePanel
        initialEntries={entries}
        initialSections={sections}
        initialGeneratedAt={now}
        windowMinutes={WINDOW_MINUTES}
      />
    </div>
  );
}
