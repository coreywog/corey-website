-- A learned merchant->category correction from the Review tab, applied
-- retroactively and checked on every future Plaid sync (see
-- lib/merchantRules.ts, lib/plaidSync.ts).
CREATE TABLE "MerchantCategoryRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "merchantCategory" TEXT NOT NULL,
    "merchantSubcategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantCategoryRule_pattern_key" ON "MerchantCategoryRule"("pattern");
