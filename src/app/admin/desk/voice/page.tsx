import Link from "next/link";
import type { Metadata } from "next";
import { MAX_DURATION_SECONDS, listAll } from "@/lib/voice-memos";
import { VoiceMemoAdmin } from "@/components/VoiceMemoAdmin";

export const metadata: Metadata = {
  title: "Voice memos — Writer's Desk",
};

export const dynamic = "force-dynamic";

// Admin surface for "Voice From The Desk". Upload a 60-90s MP3, set a
// title and optional transcript, publish/unpublish, or delete. Members
// only ever see the latest published memo on the widget — past memos
// stay here as an archive Clay can refer back to.

export default async function VoiceMemoAdminPage() {
  const memos = await listAll(100);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
      <Link
        href="/admin/desk"
        className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 500 }}
      >
        &larr; Writer&apos;s Desk
      </Link>

      <h1
        className="font-display text-ink leading-tight tracking-tight mt-4 mb-3"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Voice from the desk
      </h1>

      <p
        className="font-serif italic text-ink-muted mb-10 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        Short audio updates members hear on the widget. Record in the
        browser, up to {MAX_DURATION_SECONDS} seconds. The latest{" "}
        <em>published</em> memo is what they see — older ones stay here as
        an archive.
      </p>

      <VoiceMemoAdmin initialMemos={memos} />
    </div>
  );
}
