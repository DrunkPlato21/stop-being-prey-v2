import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";
import { TrackOnView } from "@/components/TrackOnView";

// Inline mid-article email capture. Dropped into the body around the
// ~58% mark (see splitForInlineCta) so the ask reaches readers while
// they're still in the piece, not only at the bottom where few land.
//
// Deliberately quiet: a hairline-framed aside in the publication's
// voice, not a banner. One field, the real subscriber count for honest
// social proof, and nothing that breaks the reading rhythm. Rendered as
// a sibling between the two prose halves, so .prose-article styles do
// not reach it.
//
// `slug` threads through to the analytics: TrackOnView fires `form_seen`
// when the block scrolls into view, and the form reports sub_submit /
// sub_success under source "inline" — so the per-article funnel reads
// view -> form_seen -> sub_submit -> sub_success.

export function InlineSubscribe({
  slug,
  className = "",
}: {
  slug?: string;
  className?: string;
}) {
  return (
    <aside
      className={`border-y border-rule py-10 md:py-12 my-10 md:my-14 ${className}`}
    >
      <TrackOnView event="form_seen" slug={slug} />
      <div className="max-w-xl mx-auto text-center">
        <p className="eyebrow mb-4">Keep this coming</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-6"
          style={{ fontSize: "1.05rem" }}
        >
          I&apos;d rather not lose you after this one. Email&apos;s the only
          way I can make sure the next piece actually reaches you. Leave
          yours if you want it.
        </p>
        <SubscriberCount className="mb-4" />
        <div className="flex justify-center">
          <EmailSignup source="inline" slug={slug} submitLabel="I'm in" />
        </div>
      </div>
    </aside>
  );
}
