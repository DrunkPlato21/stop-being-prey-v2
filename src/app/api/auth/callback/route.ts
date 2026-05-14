import { type NextRequest, NextResponse } from "next/server";
import {
  consumeMagicLink,
  signSession,
  safeNextPath,
  SESSION_COOKIE,
} from "@/lib/auth";

// GET /api/auth/callback?token=xxx
//
// Resolves a magic-link token to an authenticated session. Single-use:
// the token is deleted on consume. Sets the session cookie and 302s to
// the original `next` path encoded in the token record.

const SESSION_DAYS = 30;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToSignIn(req, "missing_token");
  }

  const record = await consumeMagicLink(token).catch(() => null);
  if (!record) {
    return redirectToSignIn(req, "invalid_or_expired");
  }

  let jwt: string;
  try {
    jwt = await signSession({
      email: record.email,
      customerId: record.customerId,
    });
  } catch {
    return redirectToSignIn(req, "auth_unavailable");
  }

  const next = safeNextPath(record.next);
  const response = NextResponse.redirect(new URL(next, req.url));
  response.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
  return response;
}

function redirectToSignIn(req: NextRequest, reason: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/notes/sign-in";
  url.search = "";
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
