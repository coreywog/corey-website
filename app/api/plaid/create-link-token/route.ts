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
      // dashboard under Developers -> API -> Allowed redirect URIs.
      // Unset in Sandbox, where OAuth isn't exercised.
      redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
      // Where Plaid POSTs SYNC_UPDATES_AVAILABLE etc. (see
      // app/api/plaid/webhook/route.ts). Only reachable if this is a public
      // HTTPS URL — no effect against a localhost dev server.
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      // 730 is Plaid's max — default is only 90 days, which is why the
      // first Chase/Amex connect only pulled back to late May. This only
      // takes effect on a *new* Item: per Plaid's docs, once Transactions
      // has been added to an Item this can never be changed — extending an
      // existing connection's history requires removing it and
      // reconnecting through Link again from scratch.
      transactions: { days_requested: 730 },
    });
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error("Failed to create Plaid link token", err);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
