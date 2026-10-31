import Link from "next/link";

// What a non-patron sees in place of the archive: the offer, one way in
// to patronage, and a sign-in for patrons on a fresh device. Shared by
// the index and the reading page, so a forwarded email link lands on
// the same pitch the archive itself makes.

export function PatronTeaser({
  total,
  signedIn,
  next,
}: {
  total: number;
  signedIn: boolean;
  next: string;
}) {
  return (
    <aside className="ar-teaser" aria-label="Patrons only">
      <p className="eyebrow mb-4">Patrons only</p>
      <p
        className="font-display text-ink leading-tight mb-4"
        style={{ fontSize: "clamp(1.6rem, 4vw, 2.1rem)", fontWeight: 700 }}
      >
        Patrons get every email I&apos;ve ever written.
      </p>
      <p className="font-serif text-ink-muted leading-relaxed mb-8 max-w-md mx-auto">
        All {total} of them, searchable, in one place. The archive is one of
        the ways I thank the people who fund the work.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/patronage?src=archive" className="btn-primary">
          <span>Become a patron</span>
        </Link>
        {!signedIn && (
          <Link
            href={`/notes/sign-in?next=${encodeURIComponent(next)}`}
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 600 }}
          >
            Already a patron? Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
