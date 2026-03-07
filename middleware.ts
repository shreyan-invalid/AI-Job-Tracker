import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSessionTokenCookie(request: NextRequest): boolean {
  // Auth.js cookie names vary by environment and protocol.
  const tokenCookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token"
  ];

  return tokenCookieNames.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value));
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  if (!hasSessionTokenCookie(request)) {
    return false;
  }

  const sessionResponse = await fetch(new URL("/api/auth/session", request.url), {
    headers: {
      cookie: request.headers.get("cookie") ?? ""
    },
    cache: "no-store"
  });

  if (!sessionResponse.ok) {
    return false;
  }

  const session = (await sessionResponse.json()) as { user?: unknown } | null;
  return Boolean(session?.user);
}

export async function middleware(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/upload-resume/:path*", "/jobs/:path*"]
};
