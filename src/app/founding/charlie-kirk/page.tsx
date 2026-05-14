import type { Metadata } from "next";
import { FoundingPageLayout } from "@/components/FoundingPageLayout";

// /founding/charlie-kirk — Predator and Prey. The founding text of
// Stop Being Prey. Written 2026-04-14, seven months after the
// shooting at Utah Valley. Public, no auth required.

const TITLE = "Predator and Prey";
const DECK =
  "The founding piece of Stop Being Prey. Written April 14, 2026, seven months after Charlie Kirk was killed.";

export const metadata: Metadata = {
  title: `${TITLE} | Stop Being Prey`,
  description: DECK,
  alternates: {
    canonical: "/founding/charlie-kirk",
  },
  openGraph: {
    title: TITLE,
    description: DECK,
    type: "article",
    authors: ["Clay"],
    url: "/founding/charlie-kirk",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DECK,
    creator: "@stopbeingprey",
  },
};

export default function CharlieKirkFoundingPage() {
  return (
    <FoundingPageLayout
      title={TITLE}
      dateLine="Written April 14, 2026. Seven months after Charlie Kirk was killed."
      companion={{
        title: "We Pray For Our Prey",
        href: "/founding/we-pray-for-our-prey",
      }}
    >
      {/* Essay body. `.prose-article` carries the publication's
          typographic system: serif body, 1.65–1.8 line-height,
          38rem reading column, generous paragraph spacing. Opening
          sentence wears the site-wide small-caps run-in lead
          (`.lead-incipit`) — the convention shared with the
          companion piece. */}
      <div className="prose-article">
        <p>
          <span className="lead-incipit">Charlie Kirk is dead.</span>{" "}
          Shot in the neck at a college campus. He was 31.
        </p>
        <p>
          Donald Trump lived because he turned his head at the last second.
          An inch the other way and we&apos;d have buried him too.
        </p>
        <p>
          And I watched progressives celebrate both of those moments. I
          watched them wish the bullet hadn&apos;t missed. I see it every
          day in my comments. I see the bloodlust behind their eyes and
          their words when I make an argument or ask a question they
          can&apos;t answer or don&apos;t like the implications of. I feel
          it. You&apos;d have to be asleep not to. These people hate us.
          Truly. They do not mean us well. I pray for them.
        </p>
        <p>
          Most of them won&apos;t pull a trigger. They&apos;re prey, not
          predators. But when someone else does? They feel a little glee.
          They look the other way. They say &ldquo;oh dear&rdquo; with
          half a heart and then they move on. At least it wasn&apos;t
          their guy. They&apos;ll even rationalize it and say we attacked
          ourselves. Jimmy Kimmel will announce it to the sound of
          claughter. Laughter + clapping, if you are unaware.
        </p>
        <p>
          You&apos;ve seen it. I&apos;ve seen it. That&apos;s the world
          we&apos;re actually living in.
        </p>
        <p>So let me tell you how I think about politics now.</p>
        <p>
          Not as a Republican or Democrat. Not as a conservative or
          liberal. Not as a communist or a capitalist, even. Those
          categories still matter, but they&apos;re not the ones that
          decide who wins anymore. There&apos;s a deeper frame, and once
          you see it, you can&apos;t unsee it.
        </p>
        <p>
          Predator and prey. That&apos;s it. Study this, understand your
          role in this thing and you will become dangerous.
        </p>
        <p>
          Every politician is one or the other. Every movement. Every
          voter. Every commenter in my feed. You reading this right now.
          And before you ask about their policies, their voting record, or
          their position on anything, you need to ask one question: can
          they fight? Or will they fold? Are they on someone&apos;s leash,
          or do they put others on leashes?
        </p>
        <p>
          Because a politician with all the right opinions who folds under
          pressure is worse than useless. He&apos;ll lead you into the
          lion&apos;s den and surrender at the gate. He&apos;ll get your
          people hurt. He&apos;ll get your nation killed. But he sounds
          good. He looks good. He&apos;ll say all the right things. This
          one is actually more dangerous than your enemies.
        </p>
        <p>
          Pierre Poilievre, the Canadian Conservative leader, for example,
          had the right opinions. Then he sat on Joe Rogan&apos;s podcast
          and when asked about his opposition he said &ldquo;I won&apos;t
          criticize him on foreign soil. We have a mutual respect.&rdquo;
          That&apos;s prey. He handed Carney a majority government with
          those words. The policies didn&apos;t save him. The politeness
          got him eaten. And now he wants you to keep following him. Worse
          than useless.
        </p>
        <p>
          If you have to choose between a predator who agrees with you 50%
          and prey who agrees with you 100%, you pick the predator. Every
          time. The predator at least gets something done. Prey gets your
          side massacred with their principles intact. This is why I have
          no problem saying I support Trump, even when he does things I
          hate, and he does.
        </p>
        <p>
          He&apos;s not Kamala Harris or Hillary Clinton. That&apos;s
          enough. He&apos;s an apex predator who shares many of my same
          enemies. That&apos;s enough. I don&apos;t need a perfect
          libertarian, or else I have a hissy fit. I am an adult.
          I&apos;ve read my Thomas Sowell and internalized the lessons.
          &ldquo;There are no solutions, there are only tradeoffs.&rdquo;
        </p>
        <p>Now here&apos;s the hard part:</p>
        <p>
          Not everyone is built for this fight. Most people aren&apos;t.
          That&apos;s not an insult. It&apos;s reality. And I want you to
          hear me clearly: being prey is not a shame. Prey is precious.
          Our mothers. Our children. Our sick and old men. They are what
          we fight for. They are the whole point. Raising kids is more
          important than politics. Building a business to serve your
          community is more important than politics. Tending a garden is
          more important than politics.
        </p>
        <p>
          If that&apos;s you, understand this. You are everything. You are
          what young men are willing to die for. Do not waste the security
          that brave men offer you. Build things, nurture life, follow Him.
        </p>
        <p>
          But if you&apos;re prey and you insist on being in politics
          pretending to be a predator, you are a danger to all of us.
          Every time you fold, you teach our enemies that we break. Every
          time you apologize for a fighter on our side, you tell them they
          can push harder. Every time you tone-police the people defending
          you, you hand them the bat.
        </p>
        <p>So ask yourself honestly. Are you predator or prey?</p>
        <p>
          If you&apos;re prey, find your champions. Support them. Amplify
          them. Pray for them. I aim to be one of them for you.
        </p>
        <p>
          If you&apos;re a predator, or you want to become one, I&apos;ve
          got something for you.
        </p>
        <p>
          I&apos;m writing a book. It&apos;s called Stop Being Prey.
          It&apos;s a weapon. It&apos;s going to teach conservatives how
          to fight the way our enemies fight, but with something they
          don&apos;t have. Grace. Soul. The willingness to pray for the
          people we&apos;re dismantling.
        </p>
        <p>
          The stakes are simple. You get eaten or you don&apos;t. Your
          nation survives or it doesn&apos;t. Your children grow up free
          or under the control of people who hate them.
        </p>
        <p>I know which side I&apos;m on.</p>
        <p>Are you with me?</p>

        {/* Sign-off — lowercase tilde register, name on its own
            beat. Sits inside the prose column so it inherits the
            same width + spacing as the essay body. */}
        <p
          className="font-serif text-ink"
          style={{ marginTop: "2.5rem" }}
        >
          ~ Clay
        </p>
      </div>

      {/* P.S. — quieter than body, slightly smaller, generous space
          above. Lives outside .prose-article so its first paragraph
          doesn't inherit the drop-cap. Centered around the same
          38rem reading column. */}
      <div
        className="font-serif text-ink-muted italic leading-relaxed mx-auto"
        style={{
          maxWidth: "38rem",
          fontSize: "0.95rem",
          marginTop: "4rem",
        }}
      >
        <p>
          P.S. I am writing <span className="not-italic">Stop Being Prey</span>{" "}
          without a publisher or an advance. If you want to help it exist:{" "}
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
