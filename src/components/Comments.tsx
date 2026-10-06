import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  commentLimitFor,
  getProfile,
  isAdmin,
  isApproved,
  isCommentsConfigured,
  listCommentsForSlug,
  type CommentKind,
  type CommentRecord,
} from "@/lib/comments";
import {
  getCharterSlot,
  getMidtermSlot,
  getFounderSlot,
  getMembersByEmails,
  getTierBadge,
} from "@/lib/members";
import { CommentForm } from "@/components/CommentForm";
import { CommentItem, type MemberBadgeInfo } from "@/components/CommentItem";
import { CommentsLiveRefresh } from "@/components/CommentsLiveRefresh";
import { CommentSpotlight } from "@/components/CommentSpotlight";
import { CommentHashLanding } from "@/components/CommentHashLanding";
import { JumpToMyComment } from "@/components/JumpToMyComment";
import { resolveCommentPiece } from "@/lib/comment-piece";
import {
  getCoinDataForComments,
  getSpentCommentId,
  isCoinsConfigured,
  type CoinDisplay,
} from "@/lib/coins";
import {
  PUBLIC_COMMENTS_REVALIDATE_SECONDS,
  PUBLIC_COMMENTS_TAG,
} from "@/lib/public-comments";
import { CoinProvider, CoinMemberNotice } from "@/components/CoinContext";

// Comments section. Server component. Renders the list, then either the
// comment form (signed-in members), the "you've already commented" state
// (members who posted), or the sign-in / join CTA (anonymous visitors on
// public articles).
//
// Two viewers. "request" (the default) reads the session cookie and
// fetches on every request: the member area, case files, bouts, and the
// signed-in copy of an essay. "public" is the signed-out sheet a
// prerendered essay carries: no cookies, and its Redis reads go through
// the data cache under PUBLIC_COMMENTS_TAG, which every comment write
// expires (see lib/public-comments.ts).
//
// Field-note pages are gated by /proxy.ts so visitors are always
// authenticated by the time we render here. Article pages are public,
// so we render to anyone but gate the form behind a session.

type Props = {
  kind: CommentKind;
  slug: string;
  /** Patron vocabulary on the gate. Opt-in, so /case-files and
      /notes/field-notes keep the member wording and no surface ends up
      half-translated. */
  patron?: boolean;
  /** "public" = the signed-out sheet, safe to prerender. See above. */
  viewer?: "request" | "public";
};

// Everything the sheet reads from Redis, minus the viewer. Plain arrays
// rather than Maps so the public copy survives the data cache's JSON.
type ThreadData = {
  allComments: CommentRecord[];
  basePath: string | undefined;
  badges: [string, MemberBadgeInfo][];
  coins: [string, CoinDisplay][];
};

async function readThread(
  kind: CommentKind,
  slug: string,
  isVisible: (c: CommentRecord) => boolean
): Promise<ThreadData> {
  const allComments = await listCommentsForSlug(kind, slug);
  // Where these comments actually live. Only the server can tell an
  // Arena bout from a case file — a bout mounts this sheet as kind
  // "case-file" with the bout's uuid for a slug — so the permalink a
  // member copies is resolved here once and handed down, rather than
  // guessed per comment. Resolved off any comment id; the anchor is
  // re-attached per row, so strip it back to the bare page path.
  const basePath = (
    await resolveCommentPiece(kind, slug, "x").catch(() => null)
  )?.path.replace(/#.*$/, "");
  const comments = allComments.filter(isVisible);

  // Build a per-email badge map for everyone visible on the page:
  // top-level commenters AND thread-reply authors. The map drives the
  // inline founder/tier badge in CommentItem. Both values are looked up
  // at render time so a tier change picks up on the next page load (no
  // badge field stored on the comment).
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
  // One MGET for every participant's member record instead of a GET per
  // unique email. On a comment-heavy public piece this is the difference
  // between ~1 Redis command and N per pageview.
  const memberRecords = await getMembersByEmails(uniqueEmails);
  const badges = uniqueEmails.map((email): [string, MemberBadgeInfo] => {
    // getMembersByEmails keys by normalized email; comment emails are
    // already stored normalized, but normalize the lookup to be safe.
    const m = memberRecords.get(email.toLowerCase().trim()) ?? null;
    return [
      email,
      {
        founderSlot: getFounderSlot(m),
        charterSlot: getCharterSlot(m),
        midtermSlot: getMidtermSlot(m),
        tierBadge: getTierBadge(m),
      },
    ];
  });

  const coins = isCoinsConfigured()
    ? Array.from(
        (await getCoinDataForComments(comments.map((c) => c.id))).entries()
      )
    : [];

  return { allComments, basePath, badges, coins };
}

// The signed-out thread, cached. Approved comments only, so a held
// comment never reaches the shared cache. Expired by every comment write
// (revalidatePublicComments), and on a timer as a backstop for writes
// made somewhere that can't reach this deployment's cache (localhost
// admin, scripts).
const readPublicThread = unstable_cache(
  async (kind: CommentKind, slug: string): Promise<ThreadData> => {
    const thread = await readThread(kind, slug, isApproved);
    return { ...thread, allComments: thread.allComments.filter(isApproved) };
  },
  ["comments-public-thread"],
  {
    revalidate: PUBLIC_COMMENTS_REVALIDATE_SECONDS,
    tags: [PUBLIC_COMMENTS_TAG],
  }
);

export async function Comments({
  kind,
  slug,
  patron = false,
  viewer = "request",
}: Props) {
  if (!isCommentsConfigured()) {
    // No Redis → render nothing rather than a broken section.
    return null;
  }

  // The public sheet never asks who is reading. That is what lets a
  // prerendered essay carry its comments: cookies() here would make the
  // whole page render per request again.
  const publicView = viewer === "public";
  const session = publicView
    ? null
    : await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const profile = session ? await getProfile(session.email) : null;

  const viewerEmail = session ? session.email.toLowerCase().trim() : null;
  const viewerIsAdmin = session ? isAdmin(session.email) : false;

  // Visibility filter for pre-publish hold:
  //  - approved comments are visible to everyone
  //  - pending comments are visible to (a) their author and (b) admin
  const isVisible = (c: CommentRecord): boolean => {
    if (isApproved(c)) return true;
    if (viewerIsAdmin) return true;
    if (viewerEmail && viewerEmail === c.email) return true;
    return false;
  };

  const thread = publicView
    ? await readPublicThread(kind, slug)
    : await readThread(kind, slug, isVisible);
  const allComments = thread.allComments;
  const basePath = thread.basePath;
  const comments = allComments.filter(isVisible);

  // Per-piece comment cap. Uses the unfiltered list — a pending comment
  // still counts against the member's allowance. Default is 1; some
  // pieces allow more (see commentLimitFor). The form shows while the
  // member is under the cap and is replaced by a notice once they hit it.
  const commentLimit = commentLimitFor(kind, slug);
  const myComments = viewerEmail
    ? allComments.filter((c) => c.email === viewerEmail)
    : [];
  const myCommentCount = myComments.length;
  const atCommentLimit = myCommentCount >= commentLimit;
  // Newest of their own, for the "show me my comment" jump. Their most
  // recent is the one they're looking for; the list is coin-ranked, so it
  // can be sitting anywhere.
  const myNewestCommentId =
    myComments.length > 0
      ? [...myComments].sort((a, b) => b.createdAt - a.createdAt)[0].id
      : null;

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

  const memberBadgeByEmail = new Map(thread.badges);

  // === Coins =================================================
  const coinsEnabled = isCoinsConfigured();
  const coinData = new Map(thread.coins);
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
      {/* Self-refresh so replies posted by others appear without a manual
          reload — comments are server-rendered, so without this only the
          poster ever saw new activity. */}
      <CommentsLiveRefresh />
      {/* Post-time confirmation + "show me my comment". Mounted here, not
          inside CommentForm, because the form is replaced by the
          at-limit block the moment a member posts their last one. */}
      <CommentSpotlight />
      {/* Arriving on a #c- / #r- link: land on it once the page settles. */}
      <CommentHashLanding />
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
              {patron
                ? "Coins are how patrons highlight the best comments."
                : "Coins are how inner circle members highlight the best comments."}{" "}
              <a
                href="/membership?src=comments"
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
                    viewerCanReply={viewerIsAdmin || !!profile?.displayName}
                    coinsEnabled={coinsEnabled}
                    coinCount={coinCountFor(c.id)}
                    coinGivers={coinGiversFor(c.id)}
                    coinIsOwn={isOwnFor(c)}
                    basePath={basePath}
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
                    viewerCanReply={viewerIsAdmin || !!profile?.displayName}
                    coinsEnabled={coinsEnabled}
                    coinCount={coinCountFor(c.id)}
                    coinGivers={coinGiversFor(c.id)}
                    coinIsOwn={isOwnFor(c)}
                    basePath={basePath}
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
            <div className="text-center">
              <p
                className="font-serif italic text-ink-muted leading-relaxed"
                style={{ fontSize: "0.98rem" }}
              >
                {commentLimit > 1
                  ? `Your ${commentLimit} comments on this piece are posted.`
                  : "Your comment on this piece is posted."}{" "}
                Keep the conversation going in the replies. You can reply to
                anyone above, as often as you like.
              </p>
              {/* The button, not just the words. This block is what a
                  member sees right after posting their last comment, and
                  it used to say the comments were "below" when the whole
                  list is above it. Readers took that to mean their
                  comment had not saved. */}
              {myNewestCommentId && (
                <div className="mt-4">
                  <JumpToMyComment
                    commentId={myNewestCommentId}
                    label={
                      commentLimit > 1 && myCommentCount > 1
                        ? "Show me my comments"
                        : "Show me my comment"
                    }
                  />
                </div>
              )}
              <p
                className="font-serif italic text-ink-faint mt-3"
                style={{ fontSize: "0.82rem" }}
              >
                {commentLimit > 1
                  ? "Want to swap one out? Delete it above."
                  : "Want a different comment? Delete it above."}
              </p>
            </div>
          ) : (
            <>
              {/* Already commented but still has one left. Same problem,
                  smaller: their existing comment is somewhere up the
                  coin-ranked list and they have no way to spot it. */}
              {myNewestCommentId && (
                <div className="text-center mb-6">
                  <JumpToMyComment
                    commentId={myNewestCommentId}
                    label="Show me my comment"
                  />
                </div>
              )}
              <CommentForm
                kind={kind}
                slug={slug}
                hasProfile={!!profile?.displayName}
                existingDisplayName={profile?.displayName || null}
              />
            </>
          )
        ) : (
          // Public visitors: read every approved comment above, but
          // commenting is a member thing. The old $1-per-comment path is
          // gone (nobody used it); the ask is now membership, full stop.
          <div className="text-center mb-8">
            <p
              className="font-serif text-ink leading-relaxed mb-2"
              style={{ fontSize: "1rem" }}
            >
              {patron
                ? "The comments are for patrons."
                : "The comments are for members."}
            </p>
            <p
              className="font-serif text-ink-muted leading-relaxed mb-5"
              style={{ fontSize: "1rem" }}
            >
              Reading is free for everyone. The room behind the work is
              where {patron ? "patrons" : "members"} talk, and where I talk
              back.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-3">
              <Link href="/membership?src=comments" className="cta-prestige">
                <span>{patron ? "Become a patron" : "Become a member"}</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link
                href="/notes/sign-in"
                className="font-serif italic text-ink-faint hover:text-eye-deep no-underline transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                already a {patron ? "patron" : "member"}? sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
    </CoinProvider>
  );
}
