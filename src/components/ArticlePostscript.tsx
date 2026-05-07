import Link from "next/link";

// One of three voice-matched P.S. closings, picked deterministically per
// slug so each article keeps the same P.S. across visits while different
// articles distribute across the three.
const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];

function pickVariant(slug: string): Variant {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash << 5) - hash + slug.charCodeAt(i);
    hash |= 0;
  }
  return VARIANTS[Math.abs(hash) % VARIANTS.length];
}

const psLinkClass = "text-eye-deep hover:text-ink";
const psLinkStyle: React.CSSProperties = {
  textDecoration: "underline",
  textDecorationColor: "var(--eye)",
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
};

function PSLabel() {
  return (
    <span className="text-ink not-italic" style={{ fontWeight: 600 }}>
      p.s.
    </span>
  );
}

export function ArticlePostscript({ slug }: { slug: string }) {
  const variant = pickVariant(slug);

  if (variant === "A") {
    return (
      <p className="italic text-ink-muted leading-relaxed">
        <PSLabel /> there&apos;s more like this. algorithms don&apos;t
        deliver this writing. it only arrives if you ask.{" "}
        <Link href="/join" className={psLinkClass} style={psLinkStyle}>
          subscribe
        </Link>
        .
      </p>
    );
  }

  if (variant === "B") {
    return (
      <p className="italic text-ink-muted leading-relaxed">
        <PSLabel /> if this work matters to you, the most valuable thing
        you can do is send it to one person who&apos;d get it.
      </p>
    );
  }

  return (
    <p className="italic text-ink-muted leading-relaxed">
      <PSLabel /> this publication is reader-supported. if you want it
      to keep coming:{" "}
      <Link href="/tip" className={psLinkClass} style={psLinkStyle}>
        tip
      </Link>{" "}
      <span className="text-rule" aria-hidden="true">
        ·
      </span>{" "}
      <Link href="/join" className={psLinkClass} style={psLinkStyle}>
        subscribe
      </Link>
      .
    </p>
  );
}
