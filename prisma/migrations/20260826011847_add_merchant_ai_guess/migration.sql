-- CreateTable
CREATE TABLE "MerchantAiGuess" (
    "id" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "merchantCategory" TEXT NOT NULL,
    "merchantSubcategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantAiGuess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAiGuess_merchantName_key" ON "MerchantAiGuess"("merchantName");
