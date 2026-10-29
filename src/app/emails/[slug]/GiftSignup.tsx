// The foot of a gifted email: someone who isn't on the list just read
// one, because a patron sent it to them. The one ask is the free daily
// email, on the existing join page.
//
// PLACEHOLDER COPY. Clay rewrites this in his own voice before launch.

export function GiftSignup() {
  return (
    <aside className="ar-teaser ar-gift-signup" aria-label="Get the daily email">
      <p className="eyebrow mb-4">The daily email</p>
      <p
        className="font-display text-ink leading-tight mb-4"
        style={{ fontSize: "clamp(1.6rem, 4vw, 2.1rem)", fontWeight: 700 }}
      >
        A patron thought you should read this.
      </p>
      <p className="font-serif text-ink-muted leading-relaxed mb-8 max-w-md mx-auto">
        I send an email like this most days. It&apos;s free. Leave your
        address and the next one comes to you.
      </p>
      <a href="https://readsowell.com/join" className="btn-primary">
        <span>Get the daily email, free</span>
      </a>
    </aside>
  );
}
