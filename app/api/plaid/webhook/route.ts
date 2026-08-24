import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { importJWK, jwtVerify, type JWK } from "jose";
import { prisma } from "@/lib/prisma";
import { plaid } from "@/lib/plaid";
import { syncOneItem } from "@/lib/plaidSync";

// Plaid signs each webhook with a rotating ES256 key, identified by `kid` in
// the JWT header. Verification keys are effectively static per kid, so we
// cache them in-memory rather than re-fetching on every webhook delivery —
// see https://plaid.com/docs/api/webhooks/webhook-verification/.
const verificationKeyCache = new Map<string, JWK>();

function decodeJwtSegment(token: string, index: number): Record<string, unknown> {
  const segment = token.split(".")[index];
  if (!segment) throw new Error("Malformed JWT");
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Verifies the `Plaid-Verification` JWT against the raw request body.
 * Deliberately uses only already-installed deps (jose + Node's built-in
 * crypto) rather than the jwt-decode/js-sha256/secure-compare packages
 * Plaid's own example uses, since jose covers JWT decode+verify and Node's
 * crypto already gives us a constant-time comparator.
 */
async function verifyPlaidWebhook(rawBody: string, signedJwt: string | null): Promise<boolean> {
  if (!signedJwt) return false;

  const header = decodeJwtSegment(signedJwt, 0) as { alg?: string; kid?: string };
  if (header.alg !== "ES256" || !header.kid) return false;

  let key = verificationKeyCache.get(header.kid);
  if (!key) {
    const response = await plaid().webhookVerificationKeyGet({ key_id: header.kid });
    key = response.data.key as unknown as JWK;
    verificationKeyCache.set(header.kid, key);
  }

  try {
    const keyLike = await importJWK(key, "ES256");
    await jwtVerify(signedJwt, keyLike, { maxTokenAge: "5 min" });
  } catch {
    return false; // bad signature, expired, or otherwise untrustworthy
  }

  const payload = decodeJwtSegment(signedJwt, 1) as { request_body_sha256?: string };
  if (!payload.request_body_sha256) return false;

  const actual = createHash("sha256").update(rawBody).digest();
  const expected = Buffer.from(payload.request_body_sha256, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Plaid calls this when new data is ready for an Item. We use
 * /transactions/sync (see lib/plaidSync.ts), so the webhook we care about
 * is TRANSACTIONS / SYNC_UPDATES_AVAILABLE — everything else is
 * acknowledged and ignored. Must read the body as raw text first since
 * the signature covers the exact bytes Plaid sent, not our re-serialized
 * JSON.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signedJwt = request.headers.get("plaid-verification");

  const verified = await verifyPlaidWebhook(rawBody, signedJwt).catch((err) => {
    console.error("Plaid webhook verification threw", err);
    return false;
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: { webhook_type?: string; webhook_code?: string; item_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.webhook_type === "TRANSACTIONS" && payload.webhook_code === "SYNC_UPDATES_AVAILABLE" && payload.item_id) {
    const item = await prisma.plaidItem.findUnique({ where: { itemId: payload.item_id } });
    if (item) {
      try {
        await syncOneItem(item);
      } catch (err) {
        // Acknowledge the webhook anyway — Plaid retries on non-2xx, and a
        // transient sync failure here will just catch up on the next
        // webhook or manual sync rather than needing Plaid's retry churn.
        console.error(`Plaid webhook-triggered sync failed for item ${item.itemId}`, err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
