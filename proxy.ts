import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Retired 2026-09-08 (see app/quietharbor/page.tsx) — the login form used
// to live only here, unlinked from anywhere else on the site, so obscurity
// was the real access control. It's shown openly on "/" now; this path
// just redirects there for anyone with it bookmarked, and still needs the
// same exemption below so that redirect itself isn't gated behind a
// session cookie it'll never have.
const LOGIN_PATH = "/quietharbor";

/**
 * "/" is the real login screen (app/page.tsx) for everyone, logged in or
 * not — a logged-in visitor just gets redirected onward from there instead
 * of seeing the form. Every other route requires the session cookie;
 * failing that, page routes get rewritten (not redirected — kept as a
 * rewrite from the days when the login path itself was a secret worth not
 * leaking via the browser's address bar; harmless either way now, just
 * never changed back) to "/", and API routes get a plain 401. This is only
 * an optimistic check (see Next.js docs on Proxy) — every page and
 * mutating route handler re-verifies the session independently too.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname === LOGIN_PATH ||
    pathname.startsWith("/api/auth/") ||
    // Plaid calls this directly — no admin session cookie to present. It's
    // not left open, though: the route itself verifies Plaid's ES256 JWT
    // signature (app/api/plaid/webhook/route.ts) before doing anything.
    pathname === "/api/plaid/webhook"
  ) {
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
  // Everything except Next's own static/image internals — every page and
  // API route on the site requires a valid session. (There's no custom
  // favicon to exempt anymore — app/icon.svg was removed 2026-09-08; if
  // one's ever added back, it needs the same treatment app/icon.svg used
  // to get here, since a browser requests it before ever hitting a real
  // page, including on the logged-out "/" login screen every visitor sees
  // first.)
  matcher: ["/((?!_next/static|_next/image).*)"],
};
