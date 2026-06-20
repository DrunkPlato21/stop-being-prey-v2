import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Next.js 16 renamed middleware to proxy. One file only. This module
// dispatches by path:
//   - /supporters/admin/*, /admin/*, /api/admin/* get HTTP Basic Auth
//     via ADMIN_PASSWORD.
//   - /notes (and nested) get the membership session JWT gate.

const SESSION_COOKIE = "sbp_session";
const SIGN_IN_PATH = "/notes/sign-in";
const ADMIN_REALM = 'Basic realm="Stop Being Prey admin"';

// Case files that are open to non-members as a marketing/email funnel
// surface. The detail page itself swaps in a preview chrome (links go
// to /membership) for unauthenticated viewers. Keep this list in sync
// with `public_preview: true` in each case file's frontmatter — proxy
// runs at the edge and can't read the markdown files at request time.
const PUBLIC_PREVIEW_CASE_FILE_SLUGS: ReadonlySet<string> = new Set([
  "settled-fact",
]);

function authSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function basicAuthChallenge(message: string, status = 401): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      "WWW-Authenticate": ADMIN_REALM,
    },
  });
}

function adminGate(request: NextRequest): NextResponse {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return new NextResponse("Admin password is not configured.", {
      status: 503,
    });
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return basicAuthChallenge("Authentication required.");
  }

  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return basicAuthChallenge("Invalid credentials.");
  }

  const sep = decoded.indexOf(":");
  const password = sep >= 0 ? decoded.slice(sep + 1) : decoded;
  if (password !== expected) {
    return basicAuthChallenge("Invalid credentials.");
  }

  return NextResponse.next();
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  const next = url.pathname + url.search;
  url.pathname = SIGN_IN_PATH;
  url.search = "";
  if (next && next !== SIGN_IN_PATH) {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}

async function notesGate(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl;

  // Sign-in page stays public so members can request a link.
  if (pathname === SIGN_IN_PATH) {
    return NextResponse.next();
  }

  // Dev-only preview bypass for visual testing. No effect in prod.
  if (
    process.env.NODE_ENV !== "production" &&
    searchParams.get("dev_preview") === "1"
  ) {
    return NextResponse.next();
  }

  const secret = authSecret();
  if (!secret) {
    return redirectToSignIn(req);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return redirectToSignIn(req);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return redirectToSignIn(req);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Permanent redirect of the old landing path (and the spec's /den
  // shorthand) to /desk. Done before the auth gate so unauthenticated
  // visitors get a single hop to /desk → sign-in rather than bouncing
  // through /notes first.
  if (pathname === "/notes" || pathname === "/notes/") {
    const url = request.nextUrl.clone();
    url.pathname = "/desk";
    return NextResponse.redirect(url, 301);
  }
  // The Rules of Engagement moved out from behind the membership gate
  // to a public top-level /rules (the doctrine is the public lure). Old
  // member links and bookmarks to /notes/rules get a permanent redirect.
  // Done before the auth gate so unauthenticated visitors land on the
  // public page rather than bouncing to sign-in. Anchors (#rule-N) are
  // client-side and survive the hop.
  if (pathname === "/notes/rules" || pathname === "/notes/rules/") {
    const url = request.nextUrl.clone();
    url.pathname = "/rules";
    url.search = "";
    return NextResponse.redirect(url, 301);
  }

  // The podcast frame was retired (writer, not podcaster). Audio still
  // lives inline on each essay (the Listen pill) and on Spotify, but the
  // standalone /podcast section is gone. Old links land on the archive.
  if (pathname === "/podcast" || pathname === "/podcast/") {
    const url = request.nextUrl.clone();
    url.pathname = "/writing";
    url.search = "";
    return NextResponse.redirect(url, 301);
  }

  // The writing archive moved off the magazine-flavored /issues onto
  // /writing (matches the "Writing" nav + heading). Old links redirect.
  if (pathname === "/issues" || pathname === "/issues/") {
    const url = request.nextUrl.clone();
    url.pathname = "/writing";
    url.search = "";
    return NextResponse.redirect(url, 301);
  }
  if (pathname === "/den" || pathname === "/den/") {
    const url = request.nextUrl.clone();
    url.pathname = "/desk";
    return NextResponse.redirect(url, 301);
  }
  if (pathname.startsWith("/den/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/desk" + pathname.slice("/den".length);
    url.search = search;
    return NextResponse.redirect(url, 301);
  }

  if (
    pathname.startsWith("/supporters/admin") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  ) {
    // Admin lives on localhost only. In production, return 404 so the
    // surface doesn't exist publicly — no auth bypass risk, no
    // ADMIN_PASSWORD leak, no leak of internal routes. The admin code
    // stays in the repo and runs in dev (`npm run dev`) where it's
    // reachable at localhost:3000/admin/*.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Not Found", { status: 404 });
    }
    return adminGate(request);
  }

  // Public-preview case files: unauthenticated visitors are allowed
  // through. The detail page renders preview chrome for them. Members
  // continue to see the normal layout.
  if (pathname.startsWith("/case-files/")) {
    const slug = pathname
      .replace(/^\/case-files\//, "")
      .replace(/\/$/, "")
      .split("/")[0];
    if (PUBLIC_PREVIEW_CASE_FILE_SLUGS.has(slug)) {
      return NextResponse.next();
    }
  }

  if (
    pathname === "/desk" ||
    pathname.startsWith("/desk/") ||
    pathname === "/case-files" ||
    pathname.startsWith("/case-files/") ||
    pathname === "/notifications" ||
    pathname.startsWith("/notifications/") ||
    pathname === "/lounge" ||
    pathname.startsWith("/lounge/") ||
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/notes/")
  ) {
    return notesGate(request);
  }

  return NextResponse.next();
}

export const config = {
  // Single matcher list covering all protected surfaces + legacy paths
  // that just redirect. Path-level dispatch happens inside the proxy
  // function above.
  matcher: [
    "/supporters/admin/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/notes",
    "/notes/:path*",
    "/desk",
    "/desk/:path*",
    "/case-files",
    "/case-files/:path*",
    "/notifications",
    "/notifications/:path*",
    "/lounge",
    "/lounge/:path*",
    "/book",
    "/book/:path*",
    "/den",
    "/den/:path*",
    "/podcast",
    "/issues",
  ],
};
