import Link from "next/link";
import type { Metadata } from "next";
import {
  getElsewhereEvents,
  type PulseEvent,
} from "@/lib/pulse";
import { PulseSourceGlyph } from "@/components/PulseSourceGlyph";

export const metadata: Metadata = {
  title: "Out in the world · archive",
  description: "Full archive of admin-curated Facebook, X, and YouTube posts.",
};

export const dynamic = "force-dynamic";

const ARCHIVE_LIMIT = 200;

function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 60 * 1000) {
    const m = Math.max(1, Math.floor(diff / (60 * 1000)));
    return `${m}m ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / (60 * 60 * 1000));
    return `${h}h ago`;
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day);
    return `${d}d ago`;
  }
  return new Date(at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ArchiveRow({ event, now }: { event: PulseEvent; now: number }) {
  const inner = (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p
          className="eyebrow mb-1.5 flex items-center gap-1.5"
          style={{ letterSpacing: "0.22em", fontSize: "0.62rem" }}
        >
          <PulseSourceGlyph source={event.source} />
          <span>{event.label}</span>
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.05rem" }}
        >
          {event.body}
        </p>
      </div>
      <span
        className="font-serif italic text-ink-faint shrink-0"
        style={{ fontSize: "0.82rem" }}
      >
        {formatRelative(event.at, now)}
      </span>
    </div>
  );

  if (event.link?.startsWith("/")) {
    return (
      <Link
        href={event.link}
        className="block no-underline hover:text-eye-deep transition-colors"
      >
        {inner}
      </Link>
    );
  }
  if (event.link) {
    return (
      <a
        href={event.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block no-underline hover:text-eye-deep transition-colors"
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export default async function OutInTheWorldArchivePage() {
  const events = await getElsewhereEvents({ limit: ARCHIVE_LIMIT });
  const now = Date.now();

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-20 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Out in the world.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Every post Clay&apos;s tagged across X, Facebook, and YouTube,
            newest first. Each row links back to the source.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="mb-8">
          <Link
            href="/desk"
            className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.62rem", fontWeight: 600 }}
          >
            &larr; Back to the desk
          </Link>
        </div>

        {events.length === 0 ? (
          <p
            className="font-serif italic text-ink-muted text-center leading-relaxed"
            style={{ fontSize: "1.05rem" }}
          >
            Nothing here yet. When Clay tags a post on X, Facebook, or
            YouTube, it&apos;ll land in this archive.
          </p>
        ) : (
          <ul className="flex flex-col">
            {events.map((event, idx) => (
              <li
                key={`${event.source}-${event.at}-${idx}`}
                className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <ArchiveRow event={event} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
