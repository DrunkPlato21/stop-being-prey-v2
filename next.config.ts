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
    // The early-access essay reads its markdown from content/early-access
    // via fs at request time. Opt the dir into the function bundle so the
    // page can't 404 on its own content in production.
    "/the-massie-problem": ["content/early-access/**/*"],
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
    ];
  },
};

export default nextConfig;
