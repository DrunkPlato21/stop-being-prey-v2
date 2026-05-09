import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return new NextResponse("Admin password is not configured.", {
      status: 503,
    });
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Stop Being Prey admin"',
      },
    });
  }

  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return new NextResponse("Invalid credentials.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Stop Being Prey admin"',
      },
    });
  }

  const sep = decoded.indexOf(":");
  const password = sep >= 0 ? decoded.slice(sep + 1) : decoded;
  if (password !== expected) {
    return new NextResponse("Invalid credentials.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Stop Being Prey admin"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/supporters/admin/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
