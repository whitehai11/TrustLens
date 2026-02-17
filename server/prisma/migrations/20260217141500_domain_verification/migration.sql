-- CreateEnum
CREATE TYPE "DomainVerificationMethod" AS ENUM ('DNS', 'HTTP');

-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "DomainReputation"
ADD COLUMN "verifiedOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DomainVerification" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeToken" TEXT NOT NULL,
    "method" "DomainVerificationMethod" NOT NULL,
    "status" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainVerification_domain_userId_status_expiresAt_idx" ON "DomainVerification"("domain", "userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "DomainVerification_domain_status_createdAt_idx" ON "DomainVerification"("domain", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "DomainVerification" ADD CONSTRAINT "DomainVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
