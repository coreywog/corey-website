-- CreateTable
CREATE TABLE "AdminCredential" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminCredential_pkey" PRIMARY KEY ("id")
);
