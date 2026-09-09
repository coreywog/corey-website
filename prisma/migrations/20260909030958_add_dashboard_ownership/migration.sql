-- Dashboards get a real owner as of 2026-09-09 -- private by default,
-- visible to another account only via an explicit AccountShare grant (see
-- lib/dashboardAccess.ts). "diorgarments" is the correct backfill target:
-- it's the only account that existed when every current Dashboard row was
-- created (the second account, "cgcamryn", didn't exist until after this
-- point). Nullable-add -> backfill -> NOT NULL runs as one transaction
-- (Prisma's default for a migration file), so there's no window where the
-- eventual NOT NULL constraint could be violated by a concurrent insert.

-- AlterTable
ALTER TABLE "Dashboard" ADD COLUMN "ownerUsername" TEXT;
UPDATE "Dashboard" SET "ownerUsername" = 'diorgarments';
ALTER TABLE "Dashboard" ALTER COLUMN "ownerUsername" SET NOT NULL;

-- DropIndex: name was globally unique; now unique per-owner instead, so
-- two different accounts can each have their own "Overview" dashboard.
DROP INDEX "Dashboard_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_ownerUsername_name_key" ON "Dashboard"("ownerUsername", "name");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerUsername_fkey" FOREIGN KEY ("ownerUsername") REFERENCES "AdminCredential"("username") ON DELETE RESTRICT ON UPDATE CASCADE;
