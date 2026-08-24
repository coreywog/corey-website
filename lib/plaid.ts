import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

/**
 * Single shared Plaid client. PLAID_ENV controls which of Plaid's own
 * environments we talk to — "sandbox" (fake test institutions, safe to
 * experiment against) or "production" (real banks, real data). Nothing
 * here decides which one is "correct"; that's purely which secret/env var
 * is configured in .env at any given time.
 */
function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID or PLAID_SECRET env var is not set");
  }
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox" or "production", got "${env}"`);
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

// Lazily constructed so a missing env var only throws when a route actually
// tries to use Plaid, not at module-load time (which would break every
// other route sharing this process during local dev before .env is set).
let client: PlaidApi | null = null;
export function plaid(): PlaidApi {
  if (!client) client = getPlaidClient();
  return client;
}
