import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";

// Inline mid-article email capture. Dropped into the body around the
// ~58% mark (see splitForInlineCta) so the ask reaches readers while
// they're still in the piece, not only at the bottom where few land.
//
// Deliberately quiet: a hairline-framed aside in the publication's
// voice, not a banner. One field, the real subscriber count for honest
// social proof, and nothing that breaks the reading rhythm. Rendered as
// a sibling between the two prose halves, so .prose-article styles do
// not reach it.

export function InlineSubscribe({
  className = "",
}: {
  className?: string;
}) {
  return (
    <aside
      className={`border-y border-rule py-10 md:py-12 my-10 md:my-14 ${className}`}
    >
      <div className="max-w-xl mx-auto text-center">
        <p className="eyebrow mb-4">Keep this coming</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-6"
          style={{ fontSize: "1.05rem" }}
        >
          Algorithms don&apos;t deliver this writing. It only arrives if you
          ask. The next piece goes out by email first.
        </p>
        <SubscriberCount className="mb-4" />
        <div className="flex justify-center">
          <EmailSignup />
        </div>
      </div>
    </aside>
  );
}
