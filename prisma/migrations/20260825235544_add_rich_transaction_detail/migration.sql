-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "location" TEXT,
ADD COLUMN     "paymentChannel" TEXT,
ADD COLUMN     "plaidDetailedCategory" TEXT,
ADD COLUMN     "rawName" TEXT;
