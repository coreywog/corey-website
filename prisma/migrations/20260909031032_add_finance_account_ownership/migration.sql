-- FinanceAccounts get a real "added by" attribution as of 2026-09-09 --
-- every account can still see every linked bank in Settings, but only its
-- adder can manage it, and a dashboard only pulls transactions from
-- accounts its own owner added by default (see lib/dashboardQuery.ts's
-- buildWhere). "diorgarments" is the correct backfill target -- the only
-- account that existed when every current FinanceAccount row was created
-- (imported by hand, or linked via Plaid, both before "cgcamryn" existed).

-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN "addedByUsername" TEXT;
UPDATE "FinanceAccount" SET "addedByUsername" = 'diorgarments';
ALTER TABLE "FinanceAccount" ALTER COLUMN "addedByUsername" SET NOT NULL;

-- DropIndex: name was globally unique; now unique per-adder instead.
DROP INDEX "FinanceAccount_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_addedByUsername_name_key" ON "FinanceAccount"("addedByUsername", "name");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_addedByUsername_fkey" FOREIGN KEY ("addedByUsername") REFERENCES "AdminCredential"("username") ON DELETE RESTRICT ON UPDATE CASCADE;
