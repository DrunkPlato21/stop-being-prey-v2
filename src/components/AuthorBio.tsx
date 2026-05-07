import Image from "next/image";

const linkClass =
  "font-display text-ink-muted hover:text-eye-deep no-underline uppercase transition-colors";

const linkStyle: React.CSSProperties = {
  letterSpacing: "0.18em",
  fontWeight: 500,
  fontSize: "0.78rem",
};

export function AuthorBio({ priority = false }: { priority?: boolean } = {}) {
  return (
    <div className="bg-surface border border-ink/10 p-10 md:p-12 relative">
      {/* Cat-eye corner ornaments */}
      <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-eye" />

      <div className="flex flex-col md:flex-row gap-8 md:gap-10 items-center md:items-start">
        {/* Portrait. 4:5 with object-position center top so the face
            stays visible even when the source is much taller than the
            display crop. */}
        <Image
          src="/images/clay-winter.jpg"
          alt="Clay, founder of Stop Being Prey"
          width={400}
          height={500}
          priority={priority}
          sizes="(min-width: 768px) 200px, 200px"
          className="flex-shrink-0 border border-border block transition-transform duration-300 hover:scale-[1.02]"
          style={{
            width: "200px",
            height: "250px",
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />

        {/* Text column */}
        <div className="flex-1 text-center md:text-left">
          <p className="eyebrow mb-3">About the writer</p>

          <h2
            className="font-display text-ink mb-6"
            style={{
              fontSize: "clamp(2rem, 4vw, 2.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Clay
          </h2>

          <p
            className="font-serif italic text-ink-soft"
            style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
          >
            Clay is the author of{" "}
            <em style={{ fontStyle: "normal" }}>Stop Being Prey</em>. Software
            engineer by trade. Writer by necessity. Twenty years inside
            libertarianism, out for good. Hosts the largest Thomas Sowell
            page on Facebook. Now writing the right&apos;s missing strategic
            playbook.
          </p>

          {/* Contact row, wrap-safe pairs so separators never orphan */}
          <div className="mt-6 pt-5 border-t border-rule">
            <div className="dot-row md:!justify-start">
              {[
                {
                  key: "twitter",
                  node: (
                    <a
                      href="https://twitter.com/stopbeingprey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                      style={linkStyle}
                    >
                      Twitter
                    </a>
                  ),
                },
                {
                  key: "email",
                  node: (
                    <a
                      href="mailto:clay@readsowell.com"
                      className={linkClass}
                      style={linkStyle}
                    >
                      Email
                    </a>
                  ),
                },
                {
                  key: "spotify",
                  node: (
                    <a
                      href="https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                      style={linkStyle}
                    >
                      Spotify
                    </a>
                  ),
                },
                {
                  key: "rss",
                  node: (
                    <a
                      href="https://anchor.fm/s/1121c68b8/podcast/rss"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                      style={linkStyle}
                    >
                      RSS
                    </a>
                  ),
                },
              ].map((it, i, arr) => (
                <span key={it.key} className="dot-row-pair">
                  {it.node}
                  {i < arr.length - 1 && (
                    <span className="dot-row-sep" aria-hidden="true">
                      ·
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
