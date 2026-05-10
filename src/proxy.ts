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
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/supporters/admin") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  ) {
    return adminGate(request);
  }

  if (pathname === "/notes" || pathname.startsWith("/notes/")) {
    return notesGate(request);
  }

  return NextResponse.next();
}

export const config = {
  // Single matcher list covering all protected surfaces. Path-level
  // dispatch happens inside the proxy function above.
  matcher: [
    "/supporters/admin/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/notes",
    "/notes/:path*",
  ],
};
