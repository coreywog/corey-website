-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "reviewed" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing categorized transactions as already-reviewed, so
-- introducing this field doesn't dump every never-explicitly-confirmed
-- transaction into the review queue overnight. Only rows with a real
-- category (not null, not the classifier's "couldn't guess" fallback)
-- qualify — those already needed review before this migration too.
UPDATE "Transaction"
SET "reviewed" = true
WHERE "category" = 'spending'
  AND "merchantCategory" IS NOT NULL
  AND "merchantCategory" != 'other';
