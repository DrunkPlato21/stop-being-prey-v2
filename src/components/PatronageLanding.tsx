import Link from "next/link";
import { MembershipPlans } from "@/components/MembershipPlans";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { DeskPresenceIndicator } from "@/components/DeskPresenceIndicator";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  countAllMembers,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { derivePresenceState, getPresence } from "@/lib/desk";
import { isFounderAccessValid } from "@/lib/founder-access";
import { listVisible } from "@/lib/supporters";
import { testimonialsFor } from "@/lib/testimonials";

// The patronage landing page. ONE component, rendered by three routes:
//
//   /patronage       the canonical URL
//   /membership      the historical URL, still linked all over the site
//   /support-donate  the URL in Clay's email footer and old sends
//
// Deliberately one source file rather than three copies: every future
// copy edit would otherwise have to be made three times, and the third
// one would eventually get missed. Each route owns only its own
// metadata; /membership and /support-donate declare a canonical pointing
// at /patronage so the three URLs never split a ranking signal.
//
// The frame: it sells the work, not access. The ask sits up top, the
// letter argues for paying, the wall entries and testimonials are the
// evidence, and the rooms are described honestly as something most
// patrons never open. This replaced the older access-framed /membership
// page (feature list first, badge preview, seat-scarcity strip), which
// is still in git history if it is ever wanted back.
//
// NOTE: the /membership CHILDREN are untouched and unrelated to this
// file — /membership/gift, /pool, /account, /success, /cover and
// /gift/success all still render their own pages.

/* ── WALL PROOF ─────────────────────────────────────────────────────
   Three entries lifted live from the same store /wall reads, matched on
   exact attribution so the text is the source text and can never drift
   into a paraphrase. If Clay edits or hides one on the wall, this unit
   follows. A missing entry is skipped rather than faked.
   ─────────────────────────────────────────────────────────────────── */
const WALL_PICKS = ["Murrell", "Kim", "Steve Coleman, Forsyth, GA"] as const;

// An explicit hand-picked set, in Clay's order — not a filter or a sort,
// so the sequence can't drift when the shared pool changes. Chris and
// Sean are deliberately not shown here; they stay in lib/testimonials
// and keep running on /membership.
//
// `key` is the attribution as it exists in the shared data (the lookup).
// `as` re-labels it for THIS page only, which is why the override lives
// here and not in lib/testimonials: /membership renders the same quotes
// and its own copy leans on the word "founder" (founder badge, founder
// slot), so renaming there would fight its FAQ. Quote BODIES are never
// touched — only the attribution line.
//
// Bob's re-label is a factual correction from Clay: he is a founding
// member, and the tip is not the thing worth naming. lib/testimonials
// still carries his original "sent with a $25 tip" attribution for
// /membership.
const QUOTE_PICKS: { key: string; as?: string }[] = [
  { key: "Judy, New Zealand" },
  { key: "Bob, sent with a $25 tip", as: "Bob, founding member" },
  { key: "Trish, founder", as: "Trish, founding member" },
  { key: "Don, founder", as: "Don, founding member" },
  { key: "Rachel Mills" },
];

const MEMBERSHIP_TESTIMONIALS = testimonialsFor("membership");
const READER_QUOTES = QUOTE_PICKS.map((pick) => {
  const found = MEMBERSHIP_TESTIMONIALS.find((t) => t.attribution === pick.key);
  if (!found) return undefined;
  return { ...found, attribution: pick.as ?? found.attribution };
}).filter((t) => t !== undefined);

/* ── COPY OPTIONS ───────────────────────────────────────────────────
   Nothing here is chosen. Option A is wired only so the page renders;
   switching to B is a one-line edit in each case. These strings live
   here, not in MembershipPlans, so /membership keeps its own wording.

   1. Social proof. Was "join 138 readers inside" — "inside" is an
      access word. Now the head of the wall-proof unit.
        A  138 people pay for this.
        B  138 readers keep me at the desk.

   3. Clarity line above the presets. Was "every tier gets the same
      membership. tiers above $13 add a public badge." — that sells the
      badge as a feature you buy.
        A  the amount doesn't change what you get. it changes what your
           name carries.
        B  same for every patron, whatever you pay. above $13 your name
           carries a rank.

   4. One-time giving, bottom of page. For readers who don't want a
      standing monthly commitment.
        A  Don't want a monthly commitment? The wall starts at a dollar.
        B  Not everyone wants a standing arrangement. A dollar on the
           wall is a real one.

   5. Scarcity. Was "charter rate. badge locked for life. 65 of 100
      slots left." — reads as though only 100 people may support the
      work. What is actually finite is the locked rate.
        A  charter rate. the first 100 lock $13 for life. 65 of those
           locks are left.
        B  anyone can be a patron. only the first 100 lock the rate.
           65 locks left.
   ─────────────────────────────────────────────────────────────────── */

// 1 — OPTION A
function socialProofLine(n: number): string {
  return `${n} ${n === 1 ? "person pays" : "people pay"} for this.`;
}
// 1 — OPTION B
// function socialProofLine(n: number): string {
//   return `${n} ${n === 1 ? "reader keeps" : "readers keep"} me at the desk.`;
// }

// 3 — OPTION A
const CLARITY_LINE =
  "the amount doesn't change what you get. it changes what your name carries.";
// 3 — OPTION B
// const CLARITY_LINE =
//   "same for every patron, whatever you pay. above $13 your name carries a rank.";

// 4 — OPTION A
const ONE_TIME_LINE =
  "Don't want a monthly commitment? The wall starts at a dollar.";
// 4 — OPTION B
// const ONE_TIME_LINE =
//   "Not everyone wants a standing arrangement. A dollar on the wall is a real one.";

// 5 — OPTION A
function rateLockLine(floor: string, locksLeft: number): string {
  return `charter rate. the first 100 lock ${floor} for life. ${locksLeft} of those locks are left.`;
}
// 5 — OPTION B
// function rateLockLine(floor: string, locksLeft: number): string {
//   return `anyone can be a patron. only the first 100 lock the rate. ${locksLeft} ${
//     locksLeft === 1 ? "lock" : "locks"
//   } left.`;
// }

export async function PatronageLanding({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string; access?: string; src?: string }>;
}) {
  const [founderClaimed, charterClaimed, totalMembers, wall, presence] =
    await Promise.all([
      getFounderClaimed(),
      getCharterClaimed(),
      countAllMembers(),
      listVisible(1, 200).catch(() => ({ entries: [], total: 0 })),
      getPresence(),
    ]);

  // Live presence for the pill above the Writer's Desk paragraph. Rendered
  // with hideWhenAway so it appears ONLY while Clay is actually at the
  // desk: the paragraph promises a green light that pulses when he is
  // working, and a visitor who sees the real thing pulsing right above
  // that sentence gets the proof instead of the description. When he is
  // away it renders nothing rather than advertising his absence.
  const presenceState = derivePresenceState(presence);

  // Match the three picks by exact attribution, in Clay's order. Anything
  // not found on the wall right now is simply absent.
  const wallProof = WALL_PICKS.map((attribution) =>
    wall.entries.find((e) => e.attribution === attribution)
  ).filter((e) => e !== undefined);

  // Live count for the label above the quotes. Deliberately entries.length
  // (visible + approved) rather than wall.total, which is the raw ZCARD of
  // the index and includes hidden and unapproved rows — a public claim
  // should only count what a reader can actually go and see. The 200-row
  // window above is far clear of the current index size, so this is the
  // real figure and not a page-capped one.
  const wallCount = wall.entries.length;
  // Built here rather than inline in JSX: interpolating the count and the
  // plural mid-sentence leaves the surrounding spaces at the mercy of
  // JSX whitespace collapsing, which silently ate one ("readerspaid").
  const wallLabel = `${wallCount} ${
    wallCount === 1 ? "reader" : "readers"
  } paid to put their name on the wall`;

  const sp = (await searchParams) ?? {};
  const previewArg = sp.preview ?? "";
  const accessParam = typeof sp.access === "string" ? sp.access : "";
  const srcParam = typeof sp.src === "string" ? sp.src : undefined;
  const founderAccess = accessParam
    ? await isFounderAccessValid(accessParam)
    : false;
  const previewCharter =
    process.env.NODE_ENV !== "production" && previewArg === "charter";
  const previewFilled =
    process.env.NODE_ENV !== "production" && previewArg === "filled";

  const effectiveFounderClaimed =
    previewCharter || previewFilled ? FOUNDER_CAP : founderClaimed;
  const effectiveCharterClaimed = previewFilled
    ? CHARTER_CAP
    : previewCharter
      ? 0
      : charterClaimed;

  const founderEligible = effectiveFounderClaimed < FOUNDER_CAP;
  const charterEligible =
    !founderEligible && effectiveCharterClaimed < CHARTER_CAP;
  const remaining = Math.max(0, FOUNDER_CAP - effectiveFounderClaimed);
  const charterRemaining = Math.max(0, CHARTER_CAP - effectiveCharterClaimed);

  // Scarcity is real information — the rate genuinely does lock — but
  // under patronage the finite thing is the RATE, not the number of
  // people allowed to give. Undefined once both caps are full, which
  // lets the widget fall through to its normal per-amount lines.
  let rateScarcityLine: string | undefined;
  if (founderAccess) {
    rateScarcityLine =
      "founder rate. $8 locked for life. name your price above the floor.";
  } else if (founderEligible) {
    rateScarcityLine = rateLockLine("$8", remaining);
  } else if (charterEligible) {
    rateScarcityLine = rateLockLine("$13", charterRemaining);
  }

  // Both widget instances share these. The count closes the widget: it
  // is a fact about patrons, so it belongs to the patronage ask and NOT
  // to the wall-proof unit below, whose entries are one-time givers who
  // may or may not also be patrons.
  const widgetProps = {
    founderEligible: founderAccess || founderEligible,
    founderClaimed: effectiveFounderClaimed,
    charterEligible: founderAccess ? false : charterEligible,
    charterClaimed: effectiveCharterClaimed,
    totalMembers,
    privateFounderAccess: founderAccess,
    accessToken: founderAccess ? accessParam : undefined,
    source: srcParam,
    presetOrder: "descending" as const,
    showBadgePreview: false,
    ctaVerb: "support the work",
    clarityLine: CLARITY_LINE,
    socialProofLine: socialProofLine(totalMembers),
    rateScarcityLine,
  };

  return (
    <div>
      {/* ============================================================
          THE ASK. Headline, one line, then straight into the widget.
          ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-4 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Patronage</p>

          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Every writer has to answer to someone.
          </h1>

          <p
            className="font-serif text-ink-muted leading-relaxed max-w-xl mx-auto fade-up stagger-3"
            style={{ fontSize: "1.12rem" }}
          >
            I answer to my patrons.
          </p>
        </div>
      </section>

      <section
        id="support"
        className="max-w-3xl mx-auto px-6 pt-6 pb-10"
        style={{ scrollMarginTop: "2rem" }}
      >
        <MembershipPlans {...widgetProps} />

        <p className="text-center mt-8">
          <Link
            href="/notes/sign-in"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            already a patron? sign in &rarr;
          </Link>
        </p>
      </section>

      {/* ============================================================
          THE LETTER. Clay's, verbatim. Sits high on the page, right
          after the ask, so the argument for paying lands before any
          evidence does. The /membership letter is NOT carried over —
          this one is written for the patronage frame. The closing
          paragraph is a deliberate standalone line; do not merge it
          upward. It also absorbed what was going to be a separate
          "filter" section: the "plenty of podcasts" paragraph does that
          work, so a filter block would only repeat it.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-12 md:pb-14">
        <div className="max-w-xl mx-auto space-y-5">
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Nearly every writer is paid by an institution of some kind. A
            university, a newsroom, a foundation, a media company, a
            sponsor. That&apos;s normal, it&apos;s how the job has always
            worked, and it means the writing has to keep somebody happy.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            That&apos;s not what we&apos;re doing here. The only person I
            answer to is you.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Either enough of you support me to keep writing, or this thing
            dies. There is no in between and I wouldn&apos;t have it any
            other way.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Would you? There&apos;s plenty of podcasts with endless
            advertiser interruptions for you to listen to, if you&apos;re
            into that sort of thing.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Here, we take politics seriously.
          </p>
        </div>
      </section>

      {/* ============================================================
          WALL PROOF. A live count of wall signers, then three real wall
          entries. The label states a fact about THIS group — people who
          paid to sign the wall — and not about patrons. The patron count
          stays up in the widget where it belongs; mixing them would make
          a claim about one group and show evidence from another.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 pb-2 md:pb-3">
        <div className="max-w-xl mx-auto text-center">
          {wallProof.length > 0 && (
            <>
              {/* Label sits ABOVE the quotes so it frames them: a reader
                  should know what they are looking at before reading
                  them, not after. Caption weight on purpose — it must
                  not read as a section heading and must not compete
                  with the letter directly above. */}
              <p className="mb-6">
                <Link
                  href="/wall"
                  className="font-serif italic text-ink-faint hover:text-eye-deep transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  {wallLabel}
                  {" "}
                  &rarr;
                </Link>
              </p>

              <ul className="space-y-6 text-left">
                {wallProof.map((entry) => (
                  <li
                    key={entry.id}
                    className="border border-rule bg-paper-deep px-5 py-5"
                  >
                    <blockquote
                      className="font-display italic text-ink leading-snug mb-3"
                      style={{ fontSize: "1.02rem", fontWeight: 400 }}
                    >
                      {entry.message}
                    </blockquote>
                    <figcaption
                      className="eyebrow"
                      style={{ letterSpacing: "0.2em", fontSize: "0.6rem" }}
                    >
                      {entry.attribution}
                    </figcaption>
                  </li>
                ))}
              </ul>

            </>
          )}
        </div>
      </section>

      {/* Tightened deliberately. The wall quotes and the rooms copy are
          one continuous beat, so the divider marks the turn without the
          default 4rem/4rem opening a hole between them. */}
      <EyeDivider style={{ marginTop: "2rem", marginBottom: "2rem" }} />

      {/* ========================= (a) ==============================
          The rooms. Clay's, verbatim. This REPLACED the old fine-print
          feature list (the six BENEFITS beats lifted from /membership) —
          that block and its constant are gone, not hidden. Body weight,
          not fine print: it is prose now, and it opens by saying most
          patrons never sign in, which is the honest frame for it.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 pt-2 md:pt-3 pb-2 md:pb-3">
        <div className="max-w-xl mx-auto space-y-5">
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Most patrons never sign in. That&apos;s fine, the writing is the
            point.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            But for those who do step inside, we&apos;re building a community
            that sharpens each other&apos;s claws, while having a good time.
          </p>
          <div className="desk-presence-demo">
            <DeskPresenceIndicator
              initialState={presenceState}
              href="/desk"
              hideWhenAway
            />
          </div>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            There&apos;s a <strong>Writer&apos;s Desk</strong>. This is your
            direct connection to me, as well as what leads you to everything
            else. You will see
            a green light next to my name that pulses while I&apos;m working,
            and goes out when I step away. You can leave a note on the desk
            for me, I&apos;ll answer it.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            {/* Explicit space: JSX drops the one after </strong> when the
                element opens the paragraph. */}
            <strong>The Lounge</strong>
            {" "}
            is where we go to hang out and chat
            about whatever&apos;s on your mind. Ask a question, talk about
            something you saw in the news, share a picture of your pet. Get
            to know the people inside.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Then we have <strong>The Guild</strong>, where the conversations
            need more room to think out loud. Somebody brings a fight they&apos;re losing and
            the room works out the move together. This is where you can come
            to get support and insight on any political argument you end up
            in.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Only patrons can comment on my articles. You know what a comment
            section usually looks like. Low quality is putting it kindly.
            Here, every single comment is from someone who has paid. No
            freeloading communists or spambots allowed.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            I am a software developer by trade, so this is kind of my thing.
            I&apos;m going to keep building here, while I write. There&apos;s
            plenty more to come.
          </p>
        </div>
      </section>

      <EyeDivider style={{ marginTop: "2rem", marginBottom: "2rem" }} />

      {/* ========================= (b) ==============================
          Testimonials. A fixed five, in Clay's order, with attribution
          lines re-labelled for this page via QUOTE_PICKS above. No badge
          chips: the attribution line carries the standing on its own.
          ============================================================ */}
      {READER_QUOTES.length > 0 && (
        <>
          <section className="max-w-3xl mx-auto px-6 pt-2 md:pt-3 pb-4 md:pb-5">
            <div className="text-center mb-8">
              <p className="eyebrow">What readers have been writing</p>
            </div>
            <ul className="space-y-8 max-w-2xl mx-auto">
              {READER_QUOTES.map((quote) => (
                <li key={quote.attribution}>
                  <blockquote
                    className="font-serif italic text-ink leading-relaxed mb-3"
                    style={{ fontSize: "1.15rem" }}
                  >
                    &ldquo;{quote.body}&rdquo;
                  </blockquote>
                  <p
                    className="font-serif text-ink-muted"
                    style={{ fontSize: "0.92rem" }}
                  >
                    {quote.attribution}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <EyeDivider style={{ marginTop: "2.5rem", marginBottom: "2.5rem" }} />
        </>
      )}

      {/* ========================= (c) ==============================
          The widget again, after the argument.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 pt-4 md:pt-5 pb-14 md:pb-20">
        <MembershipPlans {...widgetProps} />
      </section>

      {/* ========================= (d) ==============================
          Gift a seat. Demoted to a text link.
          ============================================================ */}
      <section className="max-w-2xl mx-auto px-6 pb-14 md:pb-20 text-center">
        <p
          className="font-serif text-ink-muted leading-relaxed max-w-md mx-auto"
          style={{ fontSize: "0.98rem" }}
        >
          Know someone who needs to be in this room?{" "}
          <Link href="/membership/gift" className="text-eye-deep hover:text-ink">
            Buy them a seat.
          </Link>
        </p>
      </section>

      <EyeDivider />

      {/* ============================================================
          NOT IN THE SKELETON. The free-list + seat-pool block below
          predates the a–d order and Clay has not called for it to be
          cut, so it is parked here rather than deleted. The P.S. block
          that used to sit above it was cut on request.
          ============================================================ */}

      {/* Free list + the seat pool */}
      <section className="max-w-2xl mx-auto px-6 py-14 md:py-20 text-center">
        <p className="eyebrow mb-4">Not ready to join?</p>
        <p
          className="font-serif text-ink leading-relaxed mb-7 max-w-md mx-auto"
          style={{ fontSize: "1.05rem" }}
        >
          The essays are free. Get them in your inbox and step closer when
          you&apos;re ready. Algorithms don&apos;t deliver this writing. It
          only arrives if you ask.
        </p>
        <div className="flex justify-center">
          <EmailSignup />
        </div>

        <p
          className="font-serif text-ink-muted leading-relaxed mt-10"
          style={{ fontSize: "0.95rem" }}
        >
          Can&apos;t afford it right now?{" "}
          <Link href="/membership/pool" className="text-eye-deep hover:text-ink">
            There&apos;s another way in.
          </Link>
        </p>
      </section>

      {/* ============================================================
          BOTTOM. One-time giving, and the only place on the page that
          links to the wall.
          ============================================================ */}
      <section className="border-t border-rule">
        <div className="max-w-2xl mx-auto px-6 py-14 md:py-20 text-center">
          <p
            className="font-serif text-ink leading-relaxed max-w-md mx-auto mb-6"
            style={{ fontSize: "1.05rem" }}
          >
            {ONE_TIME_LINE}
          </p>
          <Link
            href="/wall"
            className="font-display uppercase tracking-[0.24em] text-eye-deep hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.78rem", fontWeight: 600 }}
          >
            Sign the wall &rarr;
          </Link>
        </div>
      </section>

      <div className="text-center py-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back home
        </Link>
      </div>
    </div>
  );
}
