-- One Plaid Link connection (one bank login) — can expose multiple
-- FinanceAccounts. accessToken is encrypted the same way amount/description
-- already are (see lib/crypto.ts) — it's a credential, not a data value.
CREATE TABLE "PlaidItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "institutionName" TEXT,
    "cursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaidItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaidItem_itemId_key" ON "PlaidItem"("itemId");

-- FinanceAccount gains an optional link to a PlaidItem, for accounts synced
-- live rather than imported by hand from statement exports.
ALTER TABLE "FinanceAccount" ADD COLUMN "plaidItemId" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN "plaidAccountId" TEXT;

CREATE UNIQUE INDEX "FinanceAccount_plaidAccountId_key" ON "FinanceAccount"("plaidAccountId");

ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_plaidItemId_fkey"
    FOREIGN KEY ("plaidItemId") REFERENCES "PlaidItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Transaction gains Plaid's own stable transaction_id, present only on rows
-- that came from a live sync — needed to find this row again when a later
-- sync reports it as modified or removed.
ALTER TABLE "Transaction" ADD COLUMN "plaidTransactionId" TEXT;

CREATE UNIQUE INDEX "Transaction_plaidTransactionId_key" ON "Transaction"("plaidTransactionId");
