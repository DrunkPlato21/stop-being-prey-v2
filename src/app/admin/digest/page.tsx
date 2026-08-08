import type { Metadata } from "next";
import { DigestChamberPanel } from "@/components/DigestChamberPanel";
import {
  assembleDigest,
  getChamberedNote,
  getLastRun,
  nextDigestFireAt,
  type DigestPayload,
} from "@/lib/digest";

// Admin surface for the weekly digest — its own nav destination, per
// Clay: the Desk page is his day-to-day control panel, and the digest
// is a separate weekly instrument, not a desk control. One panel: the
// chamber (the optional note to patrons), the assembled preview of the
// next send, and the test-send button.

export const metadata: Metadata = {
  title: "Weekly digest",
};

export const dynamic = "force-dynamic";

// Compact preview of Sunday's digest: one line per section that will
// actually render, so Clay can glance and know what patrons get
// without opening a test email.
function digestPreviewLines(p: DigestPayload): string[] {
  const clip = (s: string, n = 64) =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
  const lines: string[] = [];
  if (p.note) {
    lines.push("Leads with your chambered note.");
  } else if (p.desk.statusBody) {
    lines.push(`Leads with the desk status: “${clip(p.desk.statusBody)}”`);
  } else if (p.desk.awayNote) {
    lines.push(`Leads with your away note: “${clip(p.desk.awayNote)}”`);
  } else {
    lines.push("No lead loaded. It picks up whatever the desk says at send time.");
  }
  lines.push(
    p.shipped.length > 0
      ? `New work: ${p.shipped.map((s) => clip(s.title, 40)).join(" · ")}`
      : "No new pieces this window. The floor below still sends."
  );
  if (p.rooms.qotw) {
    lines.push(`Question of the week: “${clip(p.rooms.qotw.title, 48)}”`);
  }
  if (p.rooms.latestThread) {
    lines.push(
      `Live Guild thread: “${clip(p.rooms.latestThread.title, 48)}” (${p.rooms.latestThread.replyCount} replies)`
    );
  }
  if (p.wall) {
    lines.push(`Wall: “${clip(p.wall.title, 44)}”, ${p.wall.contributorCount} names`);
  }
  if (p.pool.waiting > 0) {
    lines.push(`${p.pool.waiting} waiting on a covered seat`);
  }
  if (p.archive) {
    lines.push(`From the case files: № ${p.archive.number}, “${clip(p.archive.title, 44)}”`);
  }
  return lines;
}

export default async function DigestAdminPage() {
  const now = Date.now();
  const [payload, chamber, lastRun] = await Promise.all([
    assembleDigest(now),
    getChamberedNote(),
    getLastRun(),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-6">
        <h1
          className="font-display text-ink leading-tight tracking-tight"
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Weekly digest
        </h1>
        <p className="font-serif italic text-ink-muted mt-2">
          The Sunday patron report. It assembles itself; this page is
          only for the note you choose to send with it.
        </p>
      </header>

      <DigestChamberPanel
        initialChamber={chamber}
        lastRun={lastRun}
        nextFireAt={nextDigestFireAt(now)}
        previewLines={digestPreviewLines(payload)}
        defaultOpen
      />
    </div>
  );
}
