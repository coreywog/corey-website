-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "recurringGroupId" TEXT;

-- CreateTable
CREATE TABLE "RecurringGroup" (
    "id" TEXT NOT NULL,
    "merchantLabel" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringGroup_status_idx" ON "RecurringGroup"("status");

-- CreateIndex
CREATE INDEX "Transaction_recurringGroupId_idx" ON "Transaction"("recurringGroupId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringGroupId_fkey" FOREIGN KEY ("recurringGroupId") REFERENCES "RecurringGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
