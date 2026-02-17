-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketAuthorType" AS ENUM ('USER', 'STAFF');

-- CreateEnum
CREATE TYPE "IpRuleType" AS ENUM ('BLOCK', 'ALLOW', 'RATE_LIMIT');

-- CreateEnum
CREATE TYPE "AbuseKind" AS ENUM ('KEY_SPIKE', 'IP_SPIKE', 'ERROR_RATE', 'DOMAIN_FLOOD', 'SUSPICIOUS_UA');

-- CreateEnum
CREATE TYPE "AbuseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'MODERATOR';
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

-- DropForeignKey
ALTER TABLE "UsageLog" DROP CONSTRAINT "UsageLog_apiKeyId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReply" DROP CONSTRAINT "TicketReply_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReply" DROP CONSTRAINT "TicketReply_authorId_fkey";

-- DropIndex
DROP INDEX "ApiKey_key_key";

-- DropIndex
DROP INDEX "ApiKey_userId_idx";

-- DropIndex
DROP INDEX "Ticket_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "dailyLimit" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "last4" TEXT NOT NULL DEFAULT '0000',
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT 'tlp_xx',
ADD COLUMN     "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tier" "ApiPlan" NOT NULL DEFAULT 'FREE';

-- Migrate legacy ApiKey rows to secure storage fields before dropping plaintext key
UPDATE "ApiKey"
SET
  "tier" = "plan",
  "status" = CASE WHEN "isActive" = true THEN 'ACTIVE'::"ApiKeyStatus" ELSE 'SUSPENDED'::"ApiKeyStatus" END,
  "dailyLimit" = COALESCE(
    (SELECT p."requestsPerDay" FROM "PlanLimit" p WHERE p."plan" = "ApiKey"."plan" LIMIT 1),
    200
  ),
  "prefix" = SUBSTRING("key" FROM 1 FOR 6),
  "last4" = RIGHT("key", 4),
  "hash" = 'legacy:' || md5("key");

ALTER TABLE "ApiKey" ALTER COLUMN "hash" DROP DEFAULT;
ALTER TABLE "ApiKey" ALTER COLUMN "prefix" DROP DEFAULT;
ALTER TABLE "ApiKey" ALTER COLUMN "last4" DROP DEFAULT;
ALTER TABLE "ApiKey" ALTER COLUMN "dailyLimit" DROP DEFAULT;
ALTER TABLE "ApiKey" DROP COLUMN "isActive";
ALTER TABLE "ApiKey" DROP COLUMN "key";
ALTER TABLE "ApiKey" DROP COLUMN "plan";

-- AlterTable
ALTER TABLE "DomainReport" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedById" TEXT,
ADD COLUMN     "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "moderatorNote" TEXT;

UPDATE "DomainReport"
SET "moderationStatus" =
  CASE
    WHEN "status" = 'PENDING'::"ReportStatus" THEN 'PENDING'::"ModerationStatus"
    WHEN "status" = 'REVIEWED'::"ReportStatus" THEN 'APPROVED'::"ModerationStatus"
    WHEN "status" = 'ACTIONED'::"ReportStatus" THEN 'REJECTED'::"ModerationStatus"
    ELSE 'PENDING'::"ModerationStatus"
  END;

ALTER TABLE "DomainReport" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL';

-- DropEnum
DROP TYPE "ReportStatus";

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "TicketAuthorType" NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- Backfill ticket thread messages from legacy ticket body + replies
INSERT INTO "TicketMessage" ("id", "ticketId", "authorType", "authorId", "body", "createdAt")
SELECT
  'legacy_' || t."id",
  t."id",
  'USER'::"TicketAuthorType",
  t."userId",
  t."message",
  t."createdAt"
FROM "Ticket" t
WHERE t."message" IS NOT NULL AND LENGTH(TRIM(t."message")) > 0;

INSERT INTO "TicketMessage" ("id", "ticketId", "authorType", "authorId", "body", "createdAt")
SELECT
  tr."id",
  tr."ticketId",
  CASE WHEN tr."isAdmin" THEN 'STAFF'::"TicketAuthorType" ELSE 'USER'::"TicketAuthorType" END,
  tr."authorId",
  tr."message",
  tr."createdAt"
FROM "TicketReply" tr;

ALTER TABLE "Ticket" DROP COLUMN "message";

-- DropTable
DROP TABLE "TicketReply";

-- CreateTable
CREATE TABLE "ApiRequestLog" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "domain" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "riskLevel" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

-- Backfill legacy usage logs into ApiRequestLog
INSERT INTO "ApiRequestLog" ("id", "apiKeyId", "endpoint", "method", "ipAddress", "statusCode", "durationMs", "createdAt")
SELECT
  u."id",
  u."apiKeyId",
  u."endpoint",
  'GET',
  '0.0.0.0',
  u."statusCode",
  0,
  u."createdAt"
FROM "UsageLog" u;

-- DropTable
DROP TABLE "UsageLog";

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpRule" (
    "id" TEXT NOT NULL,
    "type" "IpRuleType" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IpRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseFlag" (
    "id" TEXT NOT NULL,
    "kind" "AbuseKind" NOT NULL,
    "severity" "AbuseSeverity" NOT NULL,
    "apiKeyId" TEXT,
    "ipAddress" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "AbuseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_createdAt_idx" ON "ApiRequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_apiKeyId_createdAt_idx" ON "ApiRequestLog"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_ipAddress_createdAt_idx" ON "ApiRequestLog"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_domain_createdAt_idx" ON "ApiRequestLog"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "IpRule_type_value_active_idx" ON "IpRule"("type", "value", "active");

-- CreateIndex
CREATE INDEX "IpRule_expiresAt_idx" ON "IpRule"("expiresAt");

-- CreateIndex
CREATE INDEX "AbuseFlag_kind_createdAt_idx" ON "AbuseFlag"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AbuseFlag_resolvedAt_createdAt_idx" ON "AbuseFlag"("resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_createdAt_idx" ON "ApiKey"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "DomainReport_moderationStatus_createdAt_idx" ON "DomainReport"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_userId_status_createdAt_idx" ON "Ticket"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "DomainReport" ADD CONSTRAINT "DomainReport_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequestLog" ADD CONSTRAINT "ApiRequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpRule" ADD CONSTRAINT "IpRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

