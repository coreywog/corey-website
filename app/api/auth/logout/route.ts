import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: NextRequest) {
  // "/" is the real login screen now (see app/page.tsx) — /quietharbor is
  // just a redirect there for old bookmarks, no reason to route through it.
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
