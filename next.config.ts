import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a prebuilt binary that webpack/turbopack
  // cannot trace. Keep it external so node_modules/ffmpeg-static is
  // resolved at runtime, with the binary intact, in the serverless
  // function bundle.
  serverExternalPackages: ["ffmpeg-static"],
  // The voice-memos upload route shells out to the ffmpeg binary.
  // NFT only sees the JS shim, which exports the binary *path* as a
  // string — so the binary itself has to be opted in manually or it
  // won't be copied into the Vercel function bundle.
  outputFileTracingIncludes: {
    "/api/admin/voice-memos": ["node_modules/ffmpeg-static/**/*"],
    // The [slug] article route reads markdown from content/articles via fs.
    // Published issues are prerendered at build, but an unpublished draft
    // renders on demand (the member/preview gate needs request-time
    // cookies), so its markdown must be in the serverless bundle or the
    // page 404s on its own content in production. Opt the dir in.
    "/[slug]": ["content/articles/**/*"],
    // OG/Twitter card routes read the bundled brand fonts from /assets via
    // src/lib/og-image.tsx. Opt the dir into each function bundle so the
    // cards always render in the right type (never a sans-serif fallback).
    "/[slug]/opengraph-image": ["assets/**/*"],
    "/[slug]/twitter-image": ["assets/**/*"],
    "/join/opengraph-image": ["assets/**/*"],
    "/join/twitter-image": ["assets/**/*"],
    "/membership/opengraph-image": ["assets/**/*"],
    "/membership/twitter-image": ["assets/**/*"],
    "/about/opengraph-image": ["assets/**/*"],
    "/about/twitter-image": ["assets/**/*"],
    "/wall/opengraph-image": ["assets/**/*"],
    "/wall/twitter-image": ["assets/**/*"],
    "/rules/opengraph-image": ["assets/**/*"],
    "/rules/twitter-image": ["assets/**/*"],
    // The 404 page suggests a few essays, read from content/articles via
    // fs. Opt the dir into the not-found bundle so the suggestions render
    // in production (degrades to no suggestions if absent, never crashes).
    "/_not-found": ["content/articles/**/*"],
    // The RSS feed reads the essays from content/articles via fs.
    "/feed.xml": ["content/articles/**/*"],
  },
  // Conservative security headers on every route. Deliberately NO
  // Content-Security-Policy — that's powerful but fragile and would risk
  // breaking the Spotify embeds / Stripe. These are all safe:
  //   - HSTS: force HTTPS (site is HTTPS-only on Vercel).
  //   - nosniff: stop MIME-type sniffing.
  //   - SAMEORIGIN: block other sites from framing us (clickjacking). Does
  //     not affect our own outbound embeds (Spotify iframes).
  //   - Referrer-Policy: don't leak full URLs cross-origin.
  //   - Permissions-Policy: restrict only clearly-unused features
  //     (geolocation, camera). Microphone is left at the default so the
  //     admin voice-memo recorder keeps working.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "Permissions-Policy", value: "geolocation=(), camera=()" },
        ],
      },
    ];
  },
  // The essay's slug was renamed from /the-massie-eulogy to
  // /the-massie-problem. Keep old links (shared URLs, the seeded desk
  // entry, sign-in redirects) working with a permanent redirect.
  async redirects() {
    return [
      {
        source: "/the-massie-eulogy",
        destination: "/the-massie-problem",
        permanent: true,
      },
      // The founding piece's slug was renamed from /founding/charlie-kirk
      // to /founding/predator-or-prey. Keep old links (shares, anything
      // indexed) working with a permanent redirect.
      {
        source: "/founding/charlie-kirk",
        destination: "/founding/predator-or-prey",
        permanent: true,
      },
      // /tip was reframed into the wall: same act (back the work), wall-first
      // framing. EXACT match only — /tip/success is the Stripe return URL and
      // must keep resolving to its own page.
      {
        source: "/tip",
        destination: "/wall",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
