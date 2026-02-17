-- AlterEnum
ALTER TYPE "AbuseKind" ADD VALUE IF NOT EXISTS 'MULTI_KEY_IP';
ALTER TYPE "AbuseKind" ADD VALUE IF NOT EXISTS 'DOMAIN_KEY_FANOUT';
ALTER TYPE "AbuseKind" ADD VALUE IF NOT EXISTS 'BURST_SCAN';
ALTER TYPE "AbuseKind" ADD VALUE IF NOT EXISTS 'DOMAIN_ENUMERATION';
ALTER TYPE "AbuseKind" ADD VALUE IF NOT EXISTS 'RISK_ESCALATION';

-- AlterTable
ALTER TABLE "DomainCheck" ALTER COLUMN "confidence" TYPE DOUBLE PRECISION USING "confidence"::double precision;

-- AlterTable
ALTER TABLE "ApiRequestLog" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;

-- AlterTable
ALTER TABLE "AdminAuditLog" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;

-- AlterTable
ALTER TABLE "AbuseFlag" ADD COLUMN IF NOT EXISTS "correlationId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DomainHistory" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "abuseSignals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    CONSTRAINT "DomainHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IpActivity" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "domain" TEXT,
    "apiKeyId" TEXT,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    CONSTRAINT "IpActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IncidentLink" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    CONSTRAINT "IncidentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IncidentNote" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DomainHistory_domain_createdAt_idx" ON "DomainHistory"("domain", "createdAt");
CREATE INDEX IF NOT EXISTS "IpActivity_ipAddress_createdAt_idx" ON "IpActivity"("ipAddress", "createdAt");
CREATE INDEX IF NOT EXISTS "IpActivity_domain_createdAt_idx" ON "IpActivity"("domain", "createdAt");
CREATE INDEX IF NOT EXISTS "IpActivity_apiKeyId_createdAt_idx" ON "IpActivity"("apiKeyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Incident_status_severity_createdAt_idx" ON "Incident"("status", "severity", "createdAt");
CREATE INDEX IF NOT EXISTS "IncidentLink_incidentId_type_idx" ON "IncidentLink"("incidentId", "type");
CREATE INDEX IF NOT EXISTS "IncidentLink_type_targetId_idx" ON "IncidentLink"("type", "targetId");
CREATE INDEX IF NOT EXISTS "IncidentNote_incidentId_createdAt_idx" ON "IncidentNote"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "IpActivity" ADD CONSTRAINT "IpActivity_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IpActivity" ADD CONSTRAINT "IpActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncidentLink" ADD CONSTRAINT "IncidentLink_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncidentNote" ADD CONSTRAINT "IncidentNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

