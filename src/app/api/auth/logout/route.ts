import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

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
  return response;
}
