-- AlterTable
ALTER TABLE "MerchantCategoryRule" ADD COLUMN "exactAmount" DOUBLE PRECISION;

-- DropIndex (old single-column uniqueness)
DROP INDEX IF EXISTS "MerchantCategoryRule_pattern_key";

-- CreateIndex (new composite uniqueness — safe, every existing row already
-- has a distinct pattern, so pairing with NULL exactAmount stays unique)
CREATE UNIQUE INDEX "MerchantCategoryRule_pattern_exactAmount_key" ON "MerchantCategoryRule"("pattern", "exactAmount");
