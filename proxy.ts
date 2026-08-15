import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Gates the entire site behind the signed session cookie. This is only an
 * optimistic check (see Next.js docs on Proxy) — `/admin/page.tsx` and every
 * mutating route handler re-verify the session independently too.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The login page + the auth routes that power it must stay reachable
  // while logged out.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
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

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except Next's own static/image internals and the favicon —
  // every page and API route on the site requires a valid session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
