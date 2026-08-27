import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_COOKIE } from "@/lib/constants";

// Edge-safe: verifies the cookie signature only (jose runs on Edge; the DB
// does not). API routes are excluded from the matcher and enforce their own
// auth — the Shortcut endpoints must work without a browser cookie.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  let authed = false;
  if (token && process.env.AUTH_COOKIE_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_COOKIE_SECRET));
      authed = true;
    } catch {
      authed = false;
    }
  }

  if (pathname.startsWith("/login")) {
    if (authed) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|healthz|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)",
  ],
};
