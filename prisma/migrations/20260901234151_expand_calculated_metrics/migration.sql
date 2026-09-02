-- AlterTable
-- updatedAt backfilled to now() for the 2 existing rows via DEFAULT, same
-- trick as every other @updatedAt column added to a non-empty table in this
-- project — Prisma's own @updatedAt keeps stamping it on every future write
-- regardless of the column's DEFAULT, so this is purely a one-time backfill.
ALTER TABLE "CalculatedMetric" ADD COLUMN     "merchantCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "percentile" INTEGER,
ADD COLUMN     "period" TEXT,
ADD COLUMN     "periodAggregation" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();
