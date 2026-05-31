import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  commentLimitFor,
  getProfile,
  isAdmin,
  isApproved,
  isCommentsConfigured,
  listCommentsForSlug,
  type CommentKind,
} from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMember,
  getTierBadge,
  type TierBadge,
} from "@/lib/members";
import { CommentForm } from "@/components/CommentForm";
import { CommentItem } from "@/components/CommentItem";
import { PaidCommentForm } from "@/components/PaidCommentForm";
import {
  getCoinDataForComments,
  getSpentCommentId,
  isCoinsConfigured,
} from "@/lib/coins";
import { CoinProvider, CoinMemberNotice } from "@/components/CoinContext";

// Comments section. Server component — fetches data on every request.
// Renders the list, then either the comment form (signed-in members),
// the "you've already commented" state (members who posted), or the
// sign-in / join CTA (anonymous visitors on public articles).
//
// Field-note pages are gated by /proxy.ts so visitors are always
// authenticated by the time we render here. Article pages are public,
// so we render to anyone but gate the form behind a session.

type Props = {
  kind: CommentKind;
  slug: string;
};

export async function Comments({ kind, slug }: Props) {
  if (!isCommentsConfigured()) {
    // No Redis → render nothing rather than a broken section.
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const profile = session ? await getProfile(session.email) : null;
  const allComments = await listCommentsForSlug(kind, slug);

  const viewerEmail = session ? session.email.toLowerCase().trim() : null;
  const viewerIsAdmin = session ? isAdmin(session.email) : false;

  // Visibility filter for pre-publish hold:
  //  - approved comments are visible to everyone
  //  - pending comments are visible to (a) their author and (b) admin
  const comments = allComments.filter((c) => {
    if (isApproved(c)) return true;
    if (viewerIsAdmin) return true;
    if (viewerEmail && viewerEmail === c.email) return true;
    return false;
  });

  // Per-piece comment cap. Uses the unfiltered list — a pending comment
  // still counts against the member's allowance. Default is 1; some
  // pieces allow more (see commentLimitFor). The form shows while the
  // member is under the cap and is replaced by a notice once they hit it.
  const commentLimit = commentLimitFor(kind, slug);
  const myCommentCount = viewerEmail
    ? allComments.filter((c) => c.email === viewerEmail).length
    : 0;
  const atCommentLimit = myCommentCount >= commentLimit;

  // Featured comments float to the top as standalone cards (see card
  // styling in CommentItem). Author replies aren't eligible to be
  // featured-floated — they're a separate visual lane and stay in their
  // chronological position. Within each group, original order is
  // preserved.
  const featuredComments = comments.filter(
    (c) => c.featured && !isAdmin(c.email)
  );
  const regularComments = comments.filter(
    (c) => !c.featured || isAdmin(c.email)
  );

  // Build a per-email badge map for everyone visible on the page:
  // top-level commenters AND thread-reply authors. One Redis lookup
  // per unique email; at typical comment volumes this is cheap. The
  // map drives the inline founder/tier badge in CommentItem. Both
  // values are looked up at render time so a tier change picks up on
  // the next page load (no badge field stored on the comment).
  const uniqueEmails = Array.from(
    new Set(
      comments
        .flatMap((c) => [
          c.email,
          ...(c.threadReplies?.map((r) => r.email) ?? []),
        ])
        .filter(Boolean)
    )
  );
  const badgeEntries = await Promise.all(
    uniqueEmails.map(async (email) => {
      const m = await getMember(email).catch(() => null);
      return [
        email,
        {
          founderSlot: getFounderSlot(m),
          charterSlot: getCharterSlot(m),
          tierBadge: getTierBadge(m),
        },
      ] as const;
    })
  );
  const memberBadgeByEmail = new Map<
    string,
    {
      founderSlot: number | null;
      charterSlot: number | null;
      tierBadge: TierBadge | null;
    }
  >(badgeEntries);

  // === Coins =================================================
  const coinsEnabled = isCoinsConfigured();
  const visibleIds = comments.map((c) => c.id);
  const coinData = coinsEnabled
    ? await getCoinDataForComments(visibleIds)
    : new Map<string, { count: number; topGivers: string[] }>();
  // The comment this viewer already funded on THIS piece (null = coin
  // unspent here). One read; drives the dead-obvious spent/unspent UI.
  const spentCommentId =
    coinsEnabled && viewerEmail
      ? await getSpentCommentId(viewerEmail, kind, slug)
      : null;
  const coinCountFor = (id: string): number => coinData.get(id)?.count ?? 0;
  const coinGiversFor = (id: string): string[] =>
    coinData.get(id)?.topGivers ?? [];
  // Server only needs to tell each comment whether the viewer authored
  // it (can't self-coin). All spent/unspent logic is derived client-side
  // from CoinProvider so a give updates every comment without a refresh.
  const isOwnFor = (c: (typeof comments)[number]): boolean =>
    !!viewerEmail && c.email === viewerEmail;

  // Coin-rank the regular list: highest coins first, newest as the
  // tiebreaker. Featured (admin-pinned) keeps its own lane above.
  const rankedRegular = [...regularComments].sort((a, b) => {
    const diff = coinCountFor(b.id) - coinCountFor(a.id);
    if (diff !== 0) return diff;
    return b.createdAt - a.createdAt;
  });

  return (
    <CoinProvider
      signedIn={!!session && coinsEnabled}
      viewerEmail={viewerEmail}
      initialSpentCommentId={spentCommentId}
    >
    <section className="max-w-2xl mx-auto px-6 mt-16">
      <div className="text-center mb-10">
        <p className="eyebrow">Comments</p>
      </div>

      {coinsEnabled && (
        <div className="mb-8 text-center">
          {session ? (
            // Reactive: flips to "You've used your coin on this article."
            // the instant a give succeeds, no refresh.
            <CoinMemberNotice />
          ) : (
            <p
              className="font-serif italic text-ink-muted leading-relaxed"
              style={{ fontSize: "0.9rem" }}
            >
              Coins are how inner circle members highlight the best
              comments.{" "}
              <a
                href="/membership"
                className="text-eye-deep"
                style={{ textDecoration: "underline" }}
              >
                Join and you get yours.
              </a>
            </p>
          )}
        </div>
      )}

      {comments.length === 0 ? (
        <p
          className="font-serif italic text-ink-muted text-center leading-relaxed"
          style={{ fontSize: "1rem" }}
        >
          No comments yet. Be the first.
        </p>
      ) : (
        <>
          {featuredComments.length > 0 && (
            <ul className="flex flex-col gap-5 mb-10">
              {featuredComments.map((c) => (
                <li key={c.id}>
                  <CommentItem
                    comment={c}
                    viewerEmail={session?.email ?? null}
                    viewerIsAdmin={viewerIsAdmin}
                    memberBadgeByEmail={memberBadgeByEmail}
                    viewerCanReply={!!profile?.displayName}
                    coinsEnabled={coinsEnabled}
                    coinCount={coinCountFor(c.id)}
                    coinGivers={coinGiversFor(c.id)}
                    coinIsOwn={isOwnFor(c)}
                  />
                </li>
              ))}
            </ul>
          )}
          {regularComments.length > 0 && (
            <ul className="flex flex-col">
              {rankedRegular.map((c, idx) => (
                <li
                  key={c.id}
                  className={
                    idx === 0 ? "py-6" : "py-6 border-t border-rule"
                  }
                >
                  <CommentItem
                    comment={c}
                    viewerEmail={session?.email ?? null}
                    viewerIsAdmin={viewerIsAdmin}
                    memberBadgeByEmail={memberBadgeByEmail}
                    viewerCanReply={!!profile?.displayName}
                    coinsEnabled={coinsEnabled}
                    coinCount={coinCountFor(c.id)}
                    coinGivers={coinGiversFor(c.id)}
                    coinIsOwn={isOwnFor(c)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Form / CTA */}
      <div className="mt-10 pt-10 border-t border-rule">
        {session ? (
          atCommentLimit ? (
            <p
              className="font-serif italic text-ink-muted text-center leading-relaxed"
              style={{ fontSize: "0.98rem" }}
            >
              {commentLimit > 1
                ? `You've added your ${commentLimit} comments. Delete one above to post another.`
                : "You've added your comment. Delete it above to post a different one."}
            </p>
          ) : (
            <CommentForm
              kind={kind}
              slug={slug}
              hasProfile={!!profile?.displayName}
              existingDisplayName={profile?.displayName || null}
            />
          )
        ) : (
          // Public visitors: read all approved comments above, choose
          // one of two paths to add their own. The paid CTA is staged
          // (step 3 wires Stripe); rendering it now keeps the layout
          // stable when the live flow lands.
          <div>
            {/* Value prop. Members on top (free path), non-members
                below (paid path with the live form). Membership CTA
                sits beside the paid form so the upsell is always
                visible to non-members who reconsider mid-typing. */}
            <div className="text-center mb-8">
              <p
                className="font-serif text-ink leading-relaxed mb-2"
                style={{ fontSize: "1rem" }}
              >
                Members comment free.
              </p>
              <p
                className="font-serif text-ink-muted leading-relaxed mb-5"
                style={{ fontSize: "1rem" }}
              >
                Non-members: $1 contribution to leave a comment.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-3">
                <Link href="/membership" className="cta-prestige">
                  <span>Become a member</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
                <Link
                  href="/notes/sign-in"
                  className="font-serif italic text-ink-faint hover:text-eye-deep no-underline transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  already a member? sign in
                </Link>
              </div>
            </div>

            {/* Inline paid form. Stays open by default — visitors who
                want to comment now don't have to click twice. */}
            <PaidCommentForm kind={kind} slug={slug} />
          </div>
        )}
      </div>
    </section>
    </CoinProvider>
  );
}
