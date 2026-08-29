-- User-defined computed columns for Data Management datasets (formulas
-- referencing other columns, evaluated at read time — see
-- lib/datasetFormula.ts). Defaults to an empty array so every existing
-- dataset row keeps parsing without a backfill.
ALTER TABLE "Dataset" ADD COLUMN "computedColumns" JSONB NOT NULL DEFAULT '[]';
