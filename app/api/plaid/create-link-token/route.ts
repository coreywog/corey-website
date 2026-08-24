import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { requireAdminSession } from "@/lib/auth";
import { plaid } from "@/lib/plaid";

/**
 * Creates a short-lived link_token that the Plaid Link widget needs to
 * initialize. This is the first step of connecting a bank — the frontend
 * calls this route, hands the token to Link, and the user picks their
 * bank and logs in inside Plaid's own hosted UI (we never see their bank
 * credentials).
 */
export async function POST() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await plaid().linkTokenCreate({
      // Single-user personal site — one fixed id is fine, Plaid just needs
      // something stable to key the connection to.
      user: { client_user_id: "corey-wogenstahl-personal-site" },
      client_name: "Corey Wogenstahl Finance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      // Required in Production/Development for OAuth institutions (Chase
      // included) — must exactly match a URI registered in the Plaid
      // dashboard under Team Settings -> API -> Allowed redirect URIs.
      // Unset in Sandbox, where OAuth isn't exercised.
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
      // Where Plaid POSTs SYNC_UPDATES_AVAILABLE etc. (see
      // app/api/plaid/webhook/route.ts). Only reachable if this is a public
      // HTTPS URL — no effect against a localhost dev server.
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    });
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error("Failed to create Plaid link token", err);
    // Temporary: surface Plaid's own error_code/error_message (safe —
    // operational detail, not a secret) instead of a flat generic string,
    // since this only reaches the single authenticated admin user. Revert
    // to a plain message once the production Link flow is confirmed working.
    const plaidError = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response
      ?.data;
    const detail = plaidError?.error_message
      ? `${plaidError.error_code}: ${plaidError.error_message}`
      : err instanceof Error
        ? err.message
        : "unknown error";
    return NextResponse.json({ error: `Failed to create link token — ${detail}` }, { status: 500 });
  }
}
