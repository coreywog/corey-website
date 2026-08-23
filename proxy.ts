import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// The only place the real login form exists. Nothing on the site links to
// it — you have to know the path. Change here (and rename the app/ folder
// to match) if it ever needs to rotate.
const LOGIN_PATH = "/quietharbor";

/**
 * "/" is a bare "work in progress" placeholder for everyone, logged in or
 * not — there's no hint anywhere that a real site exists behind it. Every
 * other route requires the session cookie; failing that, page routes get
 * rewritten (not redirected — a redirect would leak the login path via the
 * browser's address bar/history) to the same placeholder, and API routes
 * get a plain 401. This is only an optimistic check (see Next.js docs on
 * Proxy) — every page and mutating route handler re-verifies the session
 * independently too.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || pathname === LOGIN_PATH || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = await verifySessionToken(token);

  if (isValid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.rewrite(new URL("/", request.url));
}

export const config = {
  // Everything except Next's own static/image internals and the favicon —
  // every page and API route on the site requires a valid session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
