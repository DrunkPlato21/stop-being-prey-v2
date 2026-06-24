import type { Metadata } from "next";
import Link from "next/link";
import { FoundingPageLayout } from "@/components/FoundingPageLayout";

// /founding/we-pray-for-our-prey — the grace dimension of the
// predator/prey doctrine. Companion to the Charlie Kirk founding
// piece. Written 2026-04-07, the morning after Easter. Public, no
// auth required.

const TITLE = "We Pray For Our Prey";
const DECK =
  "The grace dimension of the predator/prey doctrine. Written the morning after Easter.";

export const metadata: Metadata = {
  title: `${TITLE} | Stop Being Prey`,
  description: DECK,
  alternates: {
    canonical: "/founding/we-pray-for-our-prey",
  },
  openGraph: {
    title: TITLE,
    description: DECK,
    type: "article",
    authors: ["Clay"],
    url: "/founding/we-pray-for-our-prey",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DECK,
    creator: "@stopbeingprey",
  },
};

export default function WePrayForOurPreyFoundingPage() {
  return (
    <FoundingPageLayout
      title={TITLE}
      dateLine="Written the morning after Easter."
      companion={{
        title: "Predator and Prey",
        href: "/founding/predator-or-prey",
      }}
    >
      {/* Essay body. Opening sentence carries the site-wide
          small-caps run-in lead (`.lead-incipit`) — the convention
          that replaced the old drop-cap. Auto-applied by the
          markdown pipeline elsewhere; manually wrapped here since
          the founding pages render as JSX. */}
      <div className="prose-article">
        <p>
          <span className="lead-incipit">We pray for our prey.</span>
        </p>
        <p>
          That is the line I did not know I was going to write until this
          morning, and it is the one that explains everything I have been
          trying to say for weeks now.
        </p>
        <p>Here is what I mean.</p>
        <p>
          On Easter Sunday a man named Nathan showed up on my tribute to
          Charlie Kirk to call him evil, to scold my readers for mourning
          such a horrible ‘racist’. On Easter Monday he came back with
          more of the same. Louder this time. Meaner. Three new names.
          Zero new evidence. When I dissected him in public, he didn’t
          come back at me with an argument, he just turned up his volume.
        </p>
        <p>
          At the end of my final reply to him, I wrote one sentence:{" "}
          &ldquo;I&apos;ll pray for you.&rdquo; I meant it. I prayed for
          him that night.
        </p>
        <p>And that sentence is now my doctrine.</p>
        <p>
          We must become predators out of necessity. I didn’t want to
          publicly humiliate Nathan, but Charlie is dead and Trump has
          been shot. Strangers are walking into my tribute posts on
          Easter Sunday to sneer at the corpses of murdered fathers, and
          mock my people for mourning them. The old framework of civility
          and debate died when Tyler Robinson pulled that trigger.
          Someone has to teach what comes next. That is the work I am
          doing now.
        </p>
        <p>
          One thing that separates what we are becoming from what they
          already are. One thing. It is not technique. Technique can be
          learned by anyone. It is not intelligence. Intelligence does
          not protect you from becoming a monster. It is not knowledge,
          and it’s not even courage.
        </p>
        <p>It is grace.</p>
        <p>
          We pray for them. They do not pray for us and they never will.
        </p>
        <p>
          That single gesture, the prayer for the prey, is the difference
          between a monster with a weapon and a disciplined man with a
          conscience who happens to know how to hunt when he needs to.
        </p>
        <p>And because we pray for them, we are free.</p>
        <p>
          Free from having to hate or be angry at them. Free from needing
          their approval, their agreement, their acknowledgment, or even
          their surrender. Free from spending our precious time and
          energy trying to debate people who simply mean us harm. When a
          Nathan shows up, nothing you say will reach him. Reaching him
          was never on the table. You are being hunted, and your mind is
          the bait.
        </p>
        <p>
          You do not owe him your time or your energy. You owe him
          exactly one thing, and it is the same thing you owe the rest of
          them.
        </p>
        <p>A prayer… nothing else.</p>
        <p>
          And because we pray for them, when we do choose to engage, we
          engage without becoming them.
        </p>
        <p>
          When the fight is worth fighting, when the audience is worth
          protecting, when the predator is hurting someone you love, you
          do not walk away. You stay. But you do not match his energy.
          You do something he is incapable of. You shine a light on his
          trap, let the people watching see exactly what he did, take him
          apart with composure, and walk away bigger than you arrived.
          That is what I did to Nathan over Easter. It&apos;s what I do
          most weeks, out in the open, in my comments.
        </p>
        <p>
          And then, after all of it, you pray for them. That is what
          makes you different, because that is the thing he cannot do. It
          is the thing he cannot understand, and the thing he cannot
          answer. Nathan is not your equal. Do you understand?
        </p>
        <p>This is what I am training you to become.</p>
        <p>
          Not a peaceful man who never fights. Not a raging man who
          always does. Something different. A disciplined predator who
          walks away when the fight is unworthy and hunts back when it
          is, and prays for every single one of them, every time, no
          matter which.
        </p>
        <p>A hunter who prays for his prey.</p>
        <p>A gentleman with a light.</p>
        <p>A man the Nathans have never met.</p>
        <p>
          That is what Stop Being Prey is. The book. The community. The
          whole project. I am training a class of people these
          predators have never seen before, and the thing that
          distinguishes us from them is the one thing they will never
          learn to do themselves.
        </p>
        <p>
          You are not running from them anymore. You are not matching
          them either. You are learning to stalk them with a smile and
          a prayer.
        </p>
        <p>Start today.</p>

        {/* Sign-off — two lines preserved exactly as written:
            "Stay close," (capital S, comma) and "~ Clay" on its
            own line. Sits inside .prose-article so it inherits
            the body column width + spacing. */}
        <p
          className="font-serif text-ink"
          style={{ marginTop: "2.5rem" }}
        >
          Stay close,
        </p>
        <p className="font-serif text-ink">~ Clay</p>
      </div>

      {/* P.S. — quieter than body, slightly smaller, generous space
          above. Lives outside .prose-article matching the Kirk page
          treatment exactly. */}
      <div
        className="font-serif text-ink-muted italic leading-relaxed mx-auto"
        style={{
          maxWidth: "38rem",
          fontSize: "0.95rem",
          marginTop: "4rem",
        }}
      >
        <p>
          P.S.{" "}
          <span className="not-italic">Stop Being Prey</span> is being
          written without a publisher or an advance. If you want to help
          it exist:{" "}
          <Link
            href="/tip"
            className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
            style={{ fontWeight: 600 }}
          >
            support the book &rarr;
          </Link>
        </p>
      </div>
    </FoundingPageLayout>
  );
}
