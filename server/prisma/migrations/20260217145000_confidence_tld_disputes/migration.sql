-- CreateEnum
CREATE TYPE "DomainDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DomainFeedback" ADD COLUMN "reputationWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- CreateTable
CREATE TABLE "TldStats" (
    "tld" TEXT NOT NULL,
    "totalDomains" INTEGER NOT NULL DEFAULT 0,
    "highRiskCount" INTEGER NOT NULL DEFAULT 0,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TldStats_pkey" PRIMARY KEY ("tld")
);

-- CreateTable
CREATE TABLE "DomainDispute" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "DomainDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DomainDispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainDispute_domain_status_createdAt_idx" ON "DomainDispute"("domain", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DomainDispute_userId_createdAt_idx" ON "DomainDispute"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DomainDispute" ADD CONSTRAINT "DomainDispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
