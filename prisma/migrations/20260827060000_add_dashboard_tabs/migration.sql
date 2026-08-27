-- Splits each Dashboard's single grid into named tabs (DashboardTab), each
-- with its own grid of widgets — think browser tabs, not a filter on one
-- shared grid. Every existing dashboard gets a single "Overview" tab and
-- keeps all its widgets, so nothing already built is lost.

-- CreateTable
CREATE TABLE "DashboardTab" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardTab_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardTab_dashboardId_idx" ON "DashboardTab"("dashboardId");

ALTER TABLE "DashboardTab" ADD CONSTRAINT "DashboardTab_dashboardId_fkey"
    FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one "Overview" tab per existing dashboard.
INSERT INTO "DashboardTab" ("id", "dashboardId", "name", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Overview', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Dashboard";

-- AlterTable: move widgets from Dashboard directly onto their new tab.
ALTER TABLE "DashboardWidget" ADD COLUMN "tabId" TEXT;

UPDATE "DashboardWidget" AS w
SET "tabId" = t."id"
FROM "DashboardTab" AS t
WHERE t."dashboardId" = w."dashboardId";

ALTER TABLE "DashboardWidget" ALTER COLUMN "tabId" SET NOT NULL;

ALTER TABLE "DashboardWidget" DROP CONSTRAINT "DashboardWidget_dashboardId_fkey";
DROP INDEX "DashboardWidget_dashboardId_idx";
ALTER TABLE "DashboardWidget" DROP COLUMN "dashboardId";

CREATE INDEX "DashboardWidget_tabId_idx" ON "DashboardWidget"("tabId");

ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_tabId_fkey"
    FOREIGN KEY ("tabId") REFERENCES "DashboardTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
