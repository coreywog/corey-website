import { redirect } from "next/navigation";

/**
 * Retired 2026-09-08 — this path's entire purpose was hiding the login
 * form somewhere no one would stumble onto it (see app/page.tsx, which is
 * now the real login screen). With the login shown openly on "/", keeping
 * a second identical page here would just be two copies of the same form
 * to maintain. Left as a redirect, not deleted outright, for anyone who
 * still has this exact path bookmarked.
 */
export default function QuietHarborRedirect() {
  redirect("/");
}
