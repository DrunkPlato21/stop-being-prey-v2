import { type NextRequest, NextResponse } from "next/server";
import {
  consumeMagicLink,
  explainDeadMagicLink,
  peekMagicLink,
  signSession,
  safeNextPath,
  SESSION_COOKIE,
  sessionCookieOptions,
  WHO_COOKIE,
  whoCookieOptions,
} from "@/lib/auth";
import { recordSignInFailure } from "@/lib/signin-failures";

// GET  /api/auth/callback?token=xxx  → confirm page, token untouched
// POST /api/auth/callback  (token)   → spend token, set session, 303 on
//
// The emailed link is a GET, and mail scanners fetch every link in a new
// message before the member sees it (Outlook/Hotmail especially). When
// the GET spent the token, the scanner took the one use and the member's
// own click said "already used". So the GET only checks the token is
// alive and hands off to a page with a button. Scanners follow links;
// they don't press buttons. The POST is the single use.

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToSignIn(req, "missing_token");
  }

  const alive = await peekMagicLink(token).catch(() => false);
  if (!alive) {
    await logDeadLink(token);
    return redirectToSignIn(req, "invalid_or_expired");
  }

  const url = req.nextUrl.clone();
  url.pathname = "/notes/sign-in/continue";
  url.search = "";
  url.searchParams.set("token", token);
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || !token) {
    return redirectToSignIn(req, "missing_token");
  }

  const record = await consumeMagicLink(token).catch(() => null);
  if (!record) {
    await logDeadLink(token);
    return redirectToSignIn(req, "invalid_or_expired");
  }

  let jwt: string;
  try {
    jwt = await signSession({
      email: record.email,
      customerId: record.customerId,
    });
  } catch {
    await recordSignInFailure({
      kind: "auth_unavailable",
      email: record.email,
      detail: "session signing failed",
    });
    return redirectToSignIn(req, "auth_unavailable");
  }

  const next = safeNextPath(record.next);
  // 303 so the browser follows with a GET, not a re-POST.
  const response = NextResponse.redirect(new URL(next, req.url), 303);
  response.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
  // Marker beside the session so the chrome loader asks /api/chrome, not
  // the anonymous cached endpoint, from the very first page after sign-in.
  response.cookies.set(WHO_COOKIE, "m", whoCookieOptions());
  return response;
}

// Someone landed on "that link expired or has already been used". Write
// down whose link it was and why, so it shows up on /admin/sign-in-links
// instead of waiting for them to email about it. A second tap within a
// minute of a good one is just a double-tap, not a failure.
async function logDeadLink(token: string): Promise<void> {
  const why = await explainDeadMagicLink(token).catch(() => null);
  if (!why || why.kind === "link_unknown") {
    await recordSignInFailure({ kind: "link_unknown" });
    return;
  }
  if (why.kind === "link_used") {
    if (Date.now() - why.usedAt < 60_000) return;
    await recordSignInFailure({
      kind: "link_used",
      email: why.email,
      detail: `sent ${ago(why.sentAt)}, used ${ago(why.usedAt)}`,
    });
    return;
  }
  await recordSignInFailure({
    kind: "link_expired",
    email: why.email,
    detail: `sent ${ago(why.sentAt)}, expired ${ago(why.expiresAt)}`,
  });
}

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function redirectToSignIn(req: NextRequest, reason: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/notes/sign-in";
  url.search = "";
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url, 303);
}
