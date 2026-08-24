-- Marks accounts whose transactions duplicate another already-tracked
-- account (e.g. PayPal, when it charges a linked card directly) so cash
-- flow sums can exclude them without dropping the account or its data.
ALTER TABLE "FinanceAccount" ADD COLUMN "excludeFromCashFlow" BOOLEAN NOT NULL DEFAULT false;
