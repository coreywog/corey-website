import { NextRequest, NextResponse } from "next/server";

/**
 * PAUSED: the whole site — including login — is off right now. Every
 * request gets the bare "work in progress" placeholder, logged in or not,
 * so there's no path (a stale session cookie, a direct /login visit,
 * whatever) that reaches the real pages behind it.
 *
 * Nothing else was touched — login, the session cookie machinery, and
 * every page it used to gate are all still here. To bring it back, restore
 * the auth check this replaced (see git history on this file for the
 * previous version) so logged-in sessions pass through again.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/wip") {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL("/wip", request.url));
}

export const config = {
  // Everything except Next's own static/image internals and the favicon —
  // every page and API route on the site requires a valid session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
