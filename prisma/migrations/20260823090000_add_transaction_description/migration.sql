-- Adds the two new taxonomy levels: merchantSubcategory (fine-grained,
-- e.g. "groceries") and description (encrypted raw merchant text, e.g.
-- "Trader Joe's"). merchantCategory now means the broad umbrella
-- (e.g. "food") rather than the fine-grained label it used to hold.
ALTER TABLE "Transaction" ADD COLUMN "merchantSubcategory" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "description" TEXT;

-- Backfill: existing rows' merchantCategory held the fine-grained label —
-- move it down to merchantSubcategory before remapping merchantCategory
-- itself up to the broad umbrella. description stays null for these rows;
-- the old pipeline never stored the raw text, so there's nothing to backfill.
UPDATE "Transaction" SET "merchantSubcategory" = "merchantCategory"
WHERE "merchantCategory" IS NOT NULL;

UPDATE "Transaction" SET "merchantCategory" = CASE "merchantCategory"
  WHEN 'groceries' THEN 'food'
  WHEN 'dining' THEN 'food'
  WHEN 'transport' THEN 'transport'
  WHEN 'gas' THEN 'transport'
  WHEN 'travel' THEN 'travel'
  WHEN 'subscriptions' THEN 'subscriptions'
  WHEN 'fitness' THEN 'health_fitness'
  WHEN 'healthcare' THEN 'health_fitness'
  WHEN 'insurance' THEN 'insurance'
  WHEN 'utilities' THEN 'utilities'
  WHEN 'loans' THEN 'debt'
  WHEN 'shopping' THEN 'shopping'
  WHEN 'personal_transfer' THEN 'personal_transfer'
  WHEN 'personal_care' THEN 'personal_care'
  ELSE "merchantCategory" -- e.g. "other" — no umbrella remap
END
WHERE "merchantCategory" IS NOT NULL;
