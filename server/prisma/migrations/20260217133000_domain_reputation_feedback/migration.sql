-- CreateTable
CREATE TABLE "DomainReputation" (
    "domain" TEXT NOT NULL,
    "reputationScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signals" JSONB NOT NULL,
    "counts" JSONB NOT NULL,

    CONSTRAINT "DomainReputation_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "DomainFeedback" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,

    CONSTRAINT "DomainFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainFeedback_domain_createdAt_idx" ON "DomainFeedback"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "DomainFeedback_status_createdAt_idx" ON "DomainFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DomainFeedback_userId_createdAt_idx" ON "DomainFeedback"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_feedbackId_userId_key" ON "FeedbackVote"("feedbackId", "userId");

-- CreateIndex
CREATE INDEX "FeedbackVote_userId_createdAt_idx" ON "FeedbackVote"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DomainFeedback" ADD CONSTRAINT "DomainFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainFeedback" ADD CONSTRAINT "DomainFeedback_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "DomainFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
