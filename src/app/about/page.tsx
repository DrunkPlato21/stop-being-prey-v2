import Link from "next/link";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { EyeDivider } from "@/components/Eyes";
import { AuthorBio } from "@/components/AuthorBio";
import { ReadingTracker } from "@/components/ReadingTracker";
import { TrackOnView } from "@/components/TrackOnView";
import type { Metadata } from "next";

// Social-card text. The root layout hardcodes openGraph/twitter title +
// description, and a child that omits openGraph inherits the parent's verbatim
// (Next 16 replaces the whole block, never merges). So override them here or the
// /about share card falls back to the generic site copy. The image is wired
// separately via opengraph-image.tsx.
const ABOUT_DESCRIPTION =
  "How I stopped being prey. The argument I lost in 2015, the Sowell page it built, and the doctrine I forged in the comments.";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: "About · Stop Being Prey",
    description: ABOUT_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About · Stop Being Prey",
    description: ABOUT_DESCRIPTION,
    creator: "@stopbeingprey",
  },
};

// About is a narrative origin story, not a masthead — it argues the brand by
// living it (predator vs prey, effective vs right). Body paragraphs live in
// arrays so apostrophes/quotes don't need JSX escaping; the Kirk-day post and
// the "7 Rules" link are rendered explicitly. Conversion triggers: the inline
// Rules link at peak intent, and a doctrine-first close.

// Opening runs to the "And none of that mattered." pulled line (Anchor A).
const STORY_OPEN_1: string[] = [
  "The year was 2015, and there I was in my house, feeling utter dread as I saw another text alert come in from my cousin on my phone. It was the length of an essay. I stared at it for a while, I didn't even want to open it. We were in a political argument that had been going on for days at this point, and it was only elevating in its intensity.",
  "Let me tell you a little about my cousin. I'll call him Matt. Growing up, Matt was like a brother to me. One of my best friends. Regular sleepovers, hangouts and brutal mini-stick hockey tournaments. Every family event was a treat because I knew he'd be there, and we'd have the best time getting into trouble together.",
  "As we grew older, into our late teens and early adulthood, we always remained close but not quite as close as those childhood years. In all honesty, Matt was just a more ambitious guy than I was. He's an impressive person, ridiculously competent at anything he puts his mind to. Even when it comes to guitar, both of us played since our teens… but he is leagues ahead of me in terms of skill.",
  "He has a more impressive career than me, he's always been better with women and he can command the presence of a room, I can't. This is all easy for me to admit, because it's all plainly true. But there's one area where I cannot concede to him, and that's on our understanding of politics and economics.",
  "You see, my cousin has a finely tuned sense for status and power. I'm not even sure that he's consciously aware of that. It's more of an instinct.",
  "He is a progressive, and a very serious one. Entirely embedded in a culture that rewards you for believing the right things, and never once asks whether they're true. In fact, it encourages you to push back hard on anyone who does ask.",
  "So back to that text he sent me. Can you see why I was feeling intimidated? Why I was staring at the notification dreading what was waiting for me when I clicked?",
  "Well, I eventually worked up the courage to click the damn thing, and there it was. Another essay that he clearly banged out one-handed on his lunch break.",
  "That was the thing about Matt. He would fire back at me within the hour, and it'd take me the whole day to answer him. And I mean the whole day. I wouldn't work, I barely slept, I stressed. I googled things, I'd go deep into statistics, economics and philosophy. If I noticed a contradiction, it'd keep me up at night until I'd felt I resolved it.",
];

// Resumes after Anchor A, runs to the stats paragraph (rendered explicitly).
const STORY_OPEN_2: string[] = [
  "He could bat down my facts in a heartbeat, and move the conversation towards whatever he wanted it to be about. He would shame me for my opinions, and put me on defense where I felt I had to constantly defend myself. I was literally losing money, not working, obsessing over how I was going to respond to him.",
  "\"I'm right about this!\" I'd tell myself. \"He's wrong!\" \"Why am I losing!?\"",
  "I didn't figure it out. I took the L. In the end, I ghosted him. I just stopped replying. He was in the process of shaming me for believing I should legally be able to put more than five rounds in my rifle, and I'd had enough.",
  "But the truth is, I couldn't let it go. I still haven't. It's been over a decade and I still think about that argument almost every day. Crazy right? Well, that's who I am. And here's what I didn't understand back then: losing that argument was the best thing that ever happened to me. It just took me ten years of pain and work to realize it.",
  "The thing is, in that fight, I wasn't unarmed. I'd been reading Sowell for a while, and at one point in our argument I had sent Matt one of his quotes that astutely addressed the exact thing we were arguing about.",
  "He waved it off. Moved past it as fast as he could. I didn't push. I let him regain control of the conversation.",
  "That moment really stuck with me. That little shrug. The dismissal. That's the thing I never let go of. That shrug is the reason all of this exists. It's the reason you're reading this story right now, and the reason I run the largest Thomas Sowell Quotes page on Facebook.",
  "I couldn't stop thinking about how I'd folded. The more I sat with it, the more I felt ashamed of myself for it.",
  "Sowell never did that. He never let anyone put words in his mouth, or get away with shrugging off one of his points. Nobody could wave him off the way Matt had waved me off. He wouldn't let his opponents intimidate him, shame him or take control of the conversation. He was an example of how to win. That's what I wanted!",
];

// After the stats paragraph, runs to the prey/predator line (rendered explicitly).
const STORY_OPEN_3: string[] = [
  "My God Matt, what have you unleashed?",
  "But here's the thing, for all those years, the page was only ever his words. Never mine. I was just the megaphone, I was not a voice.",
];

// After the compressed middle, leads into the Kirk block.
const STORY_OPEN_4: string[] = [
  "But then, last September, something happened. Charlie Kirk was assassinated. I wrote this on the Sowell quotes page that day.",
];

// The Kirk-day post, rendered as a distinct pulled block (his words, not
// Sowell's — the moment his own voice broke open).
const KIRK_POST: string[] = [
  "Everything changed today.",
  "We live in a different world from the one that existed yesterday.",
  "Can you feel it?",
];

const STORY_MID: string[] = [
  "Those were my words, not his. And writing them that day, while we were all in shock, something in me knew I couldn't go back to hiding behind quotes.",
  "And so, I began writing more regularly on the page, under my own name. The response was something I didn't expect. My own words started going viral. My writing was outperforming most of the Sowell quotes I was posting. I still don't quite know how to process that.",
  "But all that reach brought something with it. Progressives started showing up in my comments in droves. Some wanted to argue with me. But a lot of them were there for my audience, to hunt my readers the same way Matt once hunted me. To dominate them, shame them, put them on the defensive and extract their energy.",
  "At first, I didn't even engage. I watched. I studied them, how they operated, how they laid traps, and drew my readers into them. And not just the trolls, the real ones. Academics. Professionals. People with credentials and serious jobs.",
  "I started noticing patterns. They were behaving exactly the same way Matt behaved with me.",
  "And so, once I felt I understood them, I stepped in. I started engaging, testing everything I'd spent a decade learning against the real thing. Every exchange was an experiment.",
  "I began to quickly realize I was onto something. I was able to see all of their traps immediately, navigate around them, name exactly what they're doing with precision and put them on defense.",
  "And it wasn't a one-off. It became a constant. Hundreds of these exchanges, all of them public, all of them still there to read. I was getting my reps in.",
];

// Anchor C: the doctrine line, pulled out of the prose above and set apart.
const STORY_MID_TAIL: string[] = [
  "Now, I can argue their side better than they can. I can make the case for a $20 minimum wage stronger than the professor who teaches it. But ask one of them to honestly argue my side? They can't. They have no idea how someone like me actually thinks. For all their talk about empathy, they've never spent a second developing it for the people they disagree with politically. They never had to. The orthodoxy does their thinking for them. This is their Achilles heel.",
];

const STORY_CLOSE: string[] = [
  "So that fight I lost to Matt? He wasn't special. He was rep number one. I've run that gauntlet a thousand times since.",
  "The truth is, if Matt opened up that same argument with me today, over text, it wouldn't be a fight. I'd be toying with him.",
  "Face to face, in a room? He'd probably still get the upper hand. That's his arena. But in a war of ideas, where you've got time to think and nowhere to hide? That's my territory now.",
  "But this was never really about Matt. It's about the one thing that fight taught me, the thing it took me ten years and a lot of pain to finally understand. You don't have to fall for their traps. You can learn to see them clearly, and when you're ready, start planting your own.",
  "So that's what I do now. It's what all of this is. Stop Being Prey.",
  "That fight I lost in 2015 was one of the best things that ever happened to me. It taught me how the game really works. The difference between being effective and being right. And now, I see it everywhere. The game is clear to me, and I can make it clearer for you.",
  "We've got a lot of work ahead of us, you and me.",
];

export default function AboutPage() {
  return (
    <div>
      {/* Funnel: fires a `view` on load, then scroll milestones through the
          story body (#reading-region), so /about gets the same landed ->
          drop-off read as an article. Conversions attribute to source
          "about" via the form below. Surfaced in /admin/analytics. */}
      <ReadingTracker slug="about" />
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Why this exists</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            The fight I lost.
          </h1>
          <p className="font-serif italic text-ink-muted text-lg md:text-xl max-w-xl mx-auto leading-relaxed fade-up stagger-3">
            And the ten years it took to understand it.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 pt-12">
        <AuthorBio priority />
      </div>

      <div id="reading-region" className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <div className="prose-article">
          {STORY_OPEN_1.map((para, i) => (
            <p key={`open1-${i}`}>{para}</p>
          ))}

          {/* Anchor A: a one-line beat, enlarged to break the long opening
              stretch and give a skimmer a first handhold. */}
          <p
            className="font-display text-ink text-center leading-tight"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "2.5rem 0",
            }}
          >
            And none of that mattered.
          </p>

          {STORY_OPEN_2.map((para, i) => (
            <p key={`open2-${i}`}>{para}</p>
          ))}

          <p>
            So I started relentlessly consuming everything he ever wrote and
            posting his words on Facebook. I wanted to see if there was anyone
            else out there who saw what I saw, and it turns out there&apos;s
            quite a few of you. As of writing this, I&apos;m up to about 200,000
            followers on the page and growing. I regularly reach upwards of 20
            million impressions per month.
          </p>

          {STORY_OPEN_3.map((para, i) => (
            <p key={`open3-${i}`}>{para}</p>
          ))}

          <p>
            It took me ten years to see what really happened in that fight with
            Matt. Every time he pushed, I backed down. Every time he reframed it,
            I let him. I folded. In the end, I went quiet, tucked my tail between
            my legs and ran. I behaved like prey. Matt operated like a predator.
          </p>

          {/* Compressed middle (was two paragraphs that made one point twice). */}
          <p>
            I'd love to tell you I went on a hero's journey in those ten years. I
            didn't. Mostly they were confusion, frustration, and getting things
            wrong. Not the ideas. The ideas were mostly right. I was buried in
            the great economists of the last century. But that had nothing to do
            with why I lost to Matt. While I was learning to see the world
            correctly, he was out in it, building relationships, acquiring real
            power and status. Two totally different things.
          </p>

          {STORY_OPEN_4.map((para, i) => (
            <p key={`open4-${i}`}>{para}</p>
          ))}

          {/* The Kirk-day post — his words, set apart from the prose. */}
          <blockquote
            className="my-12 border-l-2 border-eye-deep bg-paper-deep px-6 py-7 md:px-9 md:py-8"
            style={{ fontStyle: "normal" }}
          >
            {KIRK_POST.map((line, i) => (
              <p
                key={`kirk-${i}`}
                className="font-display text-ink leading-snug"
                style={{
                  fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)",
                  fontWeight: 600,
                  margin: i === 0 ? "0 0 0.5rem" : "0 0 0.5rem",
                }}
              >
                {line}
              </p>
            ))}
            <footer
              className="eyebrow"
              style={{ marginTop: "1rem", letterSpacing: "0.2em" }}
            >
              Posted to the Sowell page, that day
            </footer>
          </blockquote>

          {STORY_MID.map((para, i) => (
            <p key={`mid-${i}`}>{para}</p>
          ))}

          {/* Anchor C: the strongest credibility line in the second half,
              pulled from the prose above and set apart for the skimmer. */}
          <p
            className="font-display text-ink text-center leading-tight"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: "2.5rem 0",
            }}
          >
            The doctrine got built here. Not in a book. In live combat, in the
            comments.
          </p>

          {STORY_MID_TAIL.map((para, i) => (
            <p key={`midtail-${i}`}>{para}</p>
          ))}

          {/* Inline conversion trigger at peak intent: the doctrine is named,
              so link it to the free front door. */}
          <p>
            Now I have my doctrine.{" "}
            <Link href="/rules">The 7 Rules</Link>.
          </p>

          {STORY_CLOSE.map((para, i) => (
            <p key={`close-${i}`}>{para}</p>
          ))}

          <p
            className="font-display italic text-ink"
            style={{ fontSize: "1.2rem", fontWeight: 400, marginTop: "2rem" }}
          >
            stay close,
            <br />~ Clay
          </p>
        </div>
      </div>

      <EyeDivider />

      {/* Doctrine-first close: the story ends on the doctrine, so the next
          step is the free front door (which captures the email downstream). */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow mb-4">Start here</p>
        <h2
          className="font-display text-ink leading-tight tracking-tight mb-6"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          The doctrine is seven rules.
        </h2>
        <p className="deck max-w-xl mx-auto mb-8">
          All seven are free to read. Start at the top, then decide how
          far you want to go.
        </p>
        <Link href="/rules" className="btn-primary">
          <span>Read the 7 Rules</span>
        </Link>
      </section>

      <EyeDivider />

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow mb-8">Stay close</p>
        {/* form_seen fires when the signup actually scrolls into view, so the
            dashboard separates "reached the form" from "never got there". */}
        <TrackOnView event="form_seen" slug="about" source="about" />
        <DualSubscribeBlock source="about" slug="about" />
      </section>

      <div className="text-center pb-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← Back home
        </Link>
      </div>
    </div>
  );
}
