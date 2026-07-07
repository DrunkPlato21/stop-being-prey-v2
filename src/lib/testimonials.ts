// Real reader testimonials, shared by the homepage strip and the
// membership page. Each is verbatim from the email/comment/tip trail;
// do not invent or paraphrase. Trimming a leading or trailing sentence
// is fine, rewording is not.
//
// Attribution rules (per Clay):
// - Full names only where explicitly cleared (Rachel Mills okayed use,
//   named or unnamed) or already public (Tom Luongo's quote is a public
//   X post).
// - Everyone from a private email or a Stripe tip: first name only.
// - Descriptors must be true. "founder" only for actual founding members.
//
// The larger curated pool lives in Clay's testimonials-library note;
// adding one here is a data edit, not a code edit.

export type TestimonialPlacement = "home" | "membership";

export type Testimonial = {
  body: string;
  attribution: string;
  /** Every surface this quote is deployed on. */
  placements: TestimonialPlacement[];
};

export const TESTIMONIALS: Testimonial[] = [
  {
    body: "I am a grandmother, a mother, someone who has always been prey... You are the first writer that I have ever paid to listen to. The world I thought I knew has gone. I need to do something!!",
    attribution: "Judy, New Zealand",
    placements: ["membership"],
  },
  {
    body: "My state legislature has been wrestling with a minimum wage law... Thank you for giving me the proper ways to confront the 'feelings' arguments. Amazingly, no push back when confronted with the value of their labor approach.",
    attribution: "Don, founder",
    placements: ["membership"],
  },
  {
    body: "Ron Paul's former press secretary here. I am totally with you. You said very well what I have been struggling with since... 2018.",
    attribution: "Rachel Mills",
    placements: ["home", "membership"],
  },
  {
    body: "Every once in a blue moon a writer comes along and articulates so well, the thoughts that I already have but can't put into words myself. You are one of those writers.",
    attribution: "Sean, founder",
    placements: ["membership"],
  },
  {
    body: "I never subscribe to things online. Something always stops me... what made me want to be a founder is Clay's earnestness in his quest.",
    attribution: "Trish, founder",
    placements: ["membership"],
  },
  {
    body: "I don't think I can manage predator, but I am tired of being prey. And I can learn.",
    attribution: "Chris, sent with a $50 tip",
    placements: ["membership"],
  },
  {
    body: "You are worth every penny. You and St Judes are the only two things I donate to.",
    attribution: "Bob, sent with a $25 tip",
    placements: ["membership"],
  },
  {
    body: "This is a very good piece. Clay is a good, well intentioned man.",
    attribution: "Tom Luongo",
    placements: ["home"],
  },
  {
    body: "I sent it to my dad before I even finished it because I knew it was going to be good. Holy cow. Masterful.",
    attribution: "Sheri, reader",
    placements: ["home"],
  },
];

export function testimonialsFor(
  placement: TestimonialPlacement
): Testimonial[] {
  return TESTIMONIALS.filter((t) => t.placements.includes(placement));
}
