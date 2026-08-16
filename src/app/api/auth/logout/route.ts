import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, WHO_COOKIE, whoCookieOptions } from "@/lib/auth";

// POST /api/auth/logout
// Clears the session cookie. No body. Redirects (303) to /notes/sign-in.

export async function POST(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/notes/sign-in";
  url.search = "";
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  // Flip the routing marker straight to anonymous — no probe needed to
  // learn what we already know.
  response.cookies.set(WHO_COOKIE, "a", whoCookieOptions());
  return response;
}
