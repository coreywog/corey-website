-- User-built, saved metrics for the dashboard builder — an aggregation
-- (sum/average/count/min/max) over an optional transaction-category
-- filter, saved centrally so building one makes it available everywhere.
CREATE TABLE "CalculatedMetric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aggregation" TEXT NOT NULL,
    "transactionCategory" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculatedMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalculatedMetric_name_key" ON "CalculatedMetric"("name");
