import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: NextRequest) {
  // Send back to the login path itself, not "/" — this redirect is only
  // ever seen by you (the person who just logged out), so it's fine for it
  // to be convenient rather than obscure.
  const response = NextResponse.redirect(new URL("/quietharbor", request.url), {
    status: 303,
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
