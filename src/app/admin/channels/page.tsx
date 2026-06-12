import Link from "next/link";
import type { Metadata } from "next";
import { listChannelPosts } from "@/lib/channel-posts";
import { ChannelsAdmin } from "@/components/ChannelsAdmin";

export const metadata: Metadata = {
  title: "Elsewhere — admin",
};

export const dynamic = "force-dynamic";

// Admin surface for the Writer's Desk "Elsewhere" feed. Clay pastes a
// Facebook, X, or YouTube post URL + the first-line preview +
// timestamp; the entry surfaces on the widget in the Elsewhere
// section, separate from the Recent Work lane that holds site content.

export default async function ChannelsAdminPage() {
  const posts = await listChannelPosts({ limit: 100 });

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
        Elsewhere
      </h1>

      <p
        className="font-serif italic text-ink-muted mb-10 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        Paste a Facebook, X, or YouTube post here to surface it in the
        Writer&apos;s Desk &ldquo;Elsewhere&rdquo; section, sitting below
        Recent Work. Newest first.
      </p>

      <ChannelsAdmin initialPosts={posts} />
    </div>
  );
}
