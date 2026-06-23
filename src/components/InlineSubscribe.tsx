import Link from "next/link";
import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";
import { TrackOnView } from "@/components/TrackOnView";
import { InlineSubscribeRouter } from "@/components/InlineSubscribeRouter";

// Inline mid-article email capture. Dropped into the body around the
// ~58% mark (see splitForInlineCta) so the ask reaches readers while
// they're still in the piece, not only at the bottom where few land.
//
// This is a SERVER component on purpose: it builds both asks (so the async
// <SubscriberCount> in the cold form renders server-side) and hands them to
// the client InlineSubscribeRouter, which only picks which to show. Making
// the whole thing a client component is what crashed before — an async
// server component can't be nested inside a client component.
//
// Routes by who the reader is, the same logic as the end-of-read block
// (FinisherAchievement) so the two surfaces never contradict each other:
//   - paying member: never reaches here. The server suppresses the whole
//     split via isPaidViewer before this renders.
//   - cold reader (not on the list): the email form (the proven converter).
//   - known subscriber: the membership ask instead. They already gave us
//     the email, so re-asking for it mid-read is noise; point them at the
//     room. The membership copy is PLACEHOLDER pending the /membership
//     rewrite, matching FinisherAchievement's asks.
//
// `slug` threads through to analytics: TrackOnView fires `form_seen` (cold)
// or `ask_shown` (subscriber) when the block scrolls into view; the form
// reports sub_submit / sub_success under source "inline".

const MEMBERSHIP_LINE =
  "You're on the list already. The room is the next step. The case files, the arguments, and me in the thread every day.";

export function InlineSubscribe({
  slug,
  className = "",
}: {
  slug?: string;
  className?: string;
}) {
  const cold = (
    <>
      <TrackOnView event="form_seen" slug={slug} source="inline" />
      <div className="max-w-xl mx-auto text-center">
        <p className="eyebrow mb-4">Keep this coming</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-6"
          style={{ fontSize: "1.05rem" }}
        >
          I&apos;d rather not lose you after this one. Email&apos;s the only way
          I can make sure the next piece actually reaches you. Leave yours if
          you want it.
        </p>
        <SubscriberCount className="mb-4" />
        <div className="flex justify-center">
          <EmailSignup source="inline" slug={slug} />
        </div>
      </div>
    </>
  );

  const member = (
    <>
      <TrackOnView event="ask_shown" slug={slug} source="inline" />
      <div className="max-w-xl mx-auto text-center">
        <p className="eyebrow mb-4">The next step</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-6"
          style={{ fontSize: "1.05rem" }}
        >
          {MEMBERSHIP_LINE}
        </p>
        <div className="flex justify-center">
          <Link href="/membership?src=inline" className="btn-primary">
            <span>Take a seat</span>
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <InlineSubscribeRouter className={className} cold={cold} member={member} />
  );
}
