import type { Metadata } from "next";
import { FoundingPageLayout } from "@/components/FoundingPageLayout";

// /founding/we-pray-for-our-prey — the grace dimension of the
// predator/prey doctrine. Companion to the Charlie Kirk founding
// piece. Written 2026-04-07, the morning after Easter. Public, no
// auth required.

const TITLE = "We Pray For Our Prey";
const DECK =
  "The grace dimension of the predator/prey doctrine. Written April 7, 2026, the morning after Easter.";

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
      dateLine="Written April 7, 2026. The morning after Easter."
      companion={{
        title: "Predator and Prey",
        href: "/founding/charlie-kirk",
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
          trying to tell you for two weeks.
        </p>
        <p>Here is what I mean.</p>
        <p>
          On Easter Sunday a man named Nathan showed up on my tribute to
          Charlie Kirk and called a murdered father evil. On Easter Monday
          he came back with more of the same. Louder this time. Meaner.
          Three new names. Zero new evidence. When I dissected him in
          public, he did not bring an argument. He brought more volume.
        </p>
        <p>
          At the end of my reply to him, I wrote one sentence:{" "}
          &ldquo;I&apos;ll pray for you.&rdquo; I meant it. I still mean
          it today.
        </p>
        <p>And that sentence is the whole thing.</p>
        <p>
          We must become predators out of necessity. Charlie is dead.
          Trump has been shot at. Strangers are walking into tribute
          posts on Easter Sunday to sneer at the corpses of murdered
          fathers, and mock the people mourning them. The old framework
          of civility and debate died with the people who trusted it.
          Someone has to teach what comes next. That is the work I am
          doing now.
        </p>
        <p>
          But there is one thing that separates what we are becoming
          from what they already are. One thing. It is not technique.
          Technique can be learned by anyone. It is not intelligence.
          Intelligence does not protect you from becoming a monster. It
          is not even courage.
        </p>
        <p>It is grace.</p>
        <p>
          We pray for them. They do not pray for us. They never will.
        </p>
        <p>
          That single beat, the prayer for the prey, is the difference
          between a monster with a weapon and a disciplined man with a
          conscience who happens to know how to hunt.
        </p>
        <p>Because we pray for them, we are free.</p>
        <p>
          Free from having to hate them. Free from needing their
          approval, their agreement, their acknowledgment, or their
          surrender. Free from spending our minds trying to convince
          men who were never going to be convinced. When a Nathan shows
          up and cannot cite a page, cannot defend a claim, cannot
          change his mind under any evidence, you are not in a debate.
          You are being recruited into a hunt, and your mind is the
          bait.
        </p>
        <p>
          You do not owe him your time. You do not owe him your energy.
          You owe him exactly one thing, and it is the same thing you
          owe the rest of them.
        </p>
        <p>A prayer. And nothing else.</p>
        <p>
          And because we pray for them, when we do choose to engage, we
          engage without becoming them.
        </p>
        <p>
          When the fight is worth fighting, when the audience is worth
          protecting, when the predator is hurting someone you love,
          you do not walk away. You stay. But you do not match his
          energy. You do something he is incapable of. You shine a
          light on his trap, let the people watching see exactly what
          he did, take him apart with composure, and walk away bigger
          than you arrived. That is what I did to Nathan over Easter.
          That is what I did to three more of them yesterday. Go look
          at my page. The dismantlings are still live.
        </p>
        <p>
          And then, after all of it, you pray for him. Because that is
          what makes you different from him. Because that is the thing
          he cannot do. Because that is the thing he cannot understand,
          and the thing he cannot answer.
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
          <a
            href="https://readsowell.com/support-donate"
            target="_blank"
            rel="noopener noreferrer"
            className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
            style={{ fontWeight: 600 }}
          >
            support the book &rarr;
          </a>
        </p>
      </div>
    </FoundingPageLayout>
  );
}
