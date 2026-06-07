import Link from "next/link";
import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";

// Site-wide conversion surface. Replaces the older email-only
// subscribe blocks: every "ask the reader to stay" moment now
// surfaces both paths (free email list + paid membership) so the
// decision is made in place instead of forcing the reader to
// navigate to find the option that fits where they are.
//
// Layout: two equal-weight columns on desktop, stacked on mobile.
// Each column uses flex-col + flex-1 on its description so the
// CTAs (form on the left, button on the right) land at the bottom
// of the row even when the descriptions wrap differently. Same
// vocabulary used on the founding pages so the conversion surface
// reads as one consistent design across the site.
//
// Pages that should NOT use this:
//   - /membership (already the destination)
//   - /join (dedicated email-signup page on purpose)
//   - Stripe success / confirmation pages (decision already made)
//   - Inline mid-essay tactical email asks (keep those focused)

export function DualSubscribeBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 max-w-3xl mx-auto text-left ${className}`}
    >
      {/* BY EMAIL — free path */}
      <div className="flex flex-col">
        <p className="eyebrow mb-3">Free · by email</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-5 flex-1"
          style={{ fontSize: "1rem" }}
        >
          The writing, straight to your inbox. Free. Start here.
        </p>
        <SubscriberCount className="mb-3" />
        <EmailSignup source="dual" />
      </div>

      {/* BY MEMBERSHIP — paid path. Vertical olive rule on desktop
          separates the two columns; on mobile they stack with no
          rule (the gap-10 carries the separation). */}
      <div className="md:border-l md:border-rule md:pl-12 flex flex-col">
        <p className="eyebrow mb-3">Members · from $13/mo</p>
        <p
          className="font-serif text-ink-muted leading-relaxed mb-5 flex-1"
          style={{ fontSize: "1rem" }}
        >
          The room behind the work, where I actually talk back and the
          book gets built in the open.
        </p>
        <div>
          <Link href="/membership" className="btn-primary">
            <span>Join Stop Being Prey</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
