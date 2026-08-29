-- Data Management Hub: user-uploaded datasets (CSV today) beyond Finance.
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "columns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dataset_name_key" ON "Dataset"("name");

CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DatasetRow_datasetId_idx" ON "DatasetRow"("datasetId");

ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_datasetId_fkey"
    FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
