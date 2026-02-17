import { Router } from "express";
import { z } from "zod";
import { DomainVerificationMethod, DomainVerificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { attachApiKeyIfPresent } from "../middleware/apiKey";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { analyzeDomain } from "../services/domainRisk";
import { publish } from "../services/events";
import { computeDomainReputation, getDomainReputation } from "../services/reputation";
import { createAdminAuditLog } from "../services/auditLog";
import { computeConfidenceIndex } from "../services/confidence";
import { recordTldObservation } from "../services/tldStats";
import {
  buildVerifiedBadgeSvg,
  generateVerificationToken,
  isBadgeEligible,
  isChallengeExpired,
  normalizeDomain,
  validateDomainVerification,
  verificationTxtValue
} from "../services/domainVerification";

const router = Router();

const domainCheckSchema = z.object({
  domain: z.string().min(3).max(255).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
});
const verifyRequestSchema = z.object({
  method: z.nativeEnum(DomainVerificationMethod).default(DomainVerificationMethod.DNS)
});
const disputeSchema = z.object({
  reason: z.string().min(10).max(3000),
  evidenceUrl: z.string().url().max(2048).optional()
});

router.post("/check", attachApiKeyIfPresent, validate(domainCheckSchema), async (req, res) => {
  const { domain } = req.body;
  const normalizedDomain = String(domain).toLowerCase();

  const result = analyzeDomain(normalizedDomain);
  const entry = await prisma.domainCheck.create({
    data: {
      domain: normalizedDomain,
      score: result.score,
      riskLevel: result.riskLevel,
      confidence: result.confidence,
      riskFactors: result.riskFactors,
      abuseSignals: result.abuseSignals,
      historicalTrend: result.historicalTrend,
      explanation: result.explanation
    }
  });

  await prisma.domainHistory.create({
    data: {
      domain: normalizedDomain,
      score: result.score,
      riskLevel: result.riskLevel,
      confidence: result.confidence,
      factors: result.riskFactors,
      abuseSignals: result.abuseSignals,
      correlationId: req.requestId
    }
  });

  const previous = await prisma.domainHistory.findMany({
    where: { domain: normalizedDomain },
    orderBy: { createdAt: "desc" },
    take: 6
  });
  let domainFlagCount = 0;
  if (previous.length >= 2) {
    const newest = previous[0];
    const older = previous[previous.length - 1];
    const scoreRise = newest.score - older.score;
    const hasNewImpersonationSignal =
      JSON.stringify(newest.factors).toLowerCase().includes("impersonation") &&
      !JSON.stringify(older.factors).toLowerCase().includes("impersonation");
    domainFlagCount = await prisma.abuseFlag.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        details: { path: ["domain"], equals: normalizedDomain }
      }
    });
    if (scoreRise > 20 || hasNewImpersonationSignal || domainFlagCount >= 2) {
      const escalation = await prisma.abuseFlag.create({
        data: {
          kind: "RISK_ESCALATION",
          severity: "HIGH",
          details: {
            domain: normalizedDomain,
            scoreRise,
            previousScore: older.score,
            currentScore: newest.score,
            hasNewImpersonationSignal,
            domainFlagCount
          },
          correlationId: req.requestId
        }
      });
      publish({
        type: "ABUSE_FLAG_CREATED",
        correlationId: req.requestId,
        payload: {
          flagId: escalation.id,
          kind: escalation.kind,
          severity: escalation.severity,
          ipAddress: null,
          apiKeyId: null
        }
      });
    }
  }

  res.locals.riskLevel = entry.riskLevel;
  res.locals.score = entry.score;
  await recordTldObservation({ domain: normalizedDomain, riskLevel: entry.riskLevel });

  const approvedCommunityReports = await prisma.domainFeedback.count({
    where: { domain: normalizedDomain, status: "APPROVED" }
  });
  if (domainFlagCount === 0) {
    domainFlagCount = await prisma.abuseFlag.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        details: { path: ["domain"], equals: normalizedDomain }
      }
    });
  }
  const hasAbuseFlags = domainFlagCount > 0;
  const historicalConsistency =
    previous.length >= 3 &&
    Math.abs(previous[0].score - previous[1].score) <= 10 &&
    Math.abs(previous[1].score - previous[2].score) <= 10;
  const conflictingSignals =
    (result.riskLevel === "LOW" || result.riskLevel === "MEDIUM") &&
    (hasAbuseFlags || result.abuseSignals.length >= 2) &&
    result.riskFactors.length === 0;
  const dataSparse = previous.length < 2 && approvedCommunityReports === 0 && !hasAbuseFlags;
  const confidence = computeConfidenceIndex({
    impersonationTriggered: result.riskFactors.some((f) => /impersonation|brand|typosquat/i.test(f)),
    independentModulesTriggered: result.technicalDetails.modulesTriggered.length,
    historicalConsistency,
    hasAbuseFlags,
    hasApprovedCommunityReports: approvedCommunityReports > 0,
    conflictingSignals,
    dataSparse
  });

  void computeDomainReputation(normalizedDomain).catch(() => undefined);

  return res.json({
    score: entry.score,
    riskLevel: entry.riskLevel,
    confidence: entry.confidence,
    confidenceIndex: confidence.confidenceIndex,
    confidenceLabel: confidence.confidenceLabel,
    riskFactors: entry.riskFactors,
    abuseSignals: entry.abuseSignals,
    historicalTrend: entry.historicalTrend,
    explanation: entry.explanation,
    timestamp: entry.timestamp
  });
});

router.get("/:domain/reputation", async (req, res) => {
  const domain = normalizeDomain(req.params.domain || "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "Invalid domain", requestId: req.requestId });
  }
  const reputation = await getDomainReputation(domain);
  return res.json(reputation);
});

router.post("/:domain/verify-request", requireAuth, validate(verifyRequestSchema), async (req, res) => {
  const rawDomainParam = Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain;
  const domain = normalizeDomain(rawDomainParam || "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "Invalid domain", requestId: req.requestId });
  }

  const method = req.body.method as DomainVerificationMethod;
  const now = new Date();
  await prisma.domainVerification.updateMany({
    where: {
      userId: req.authUser!.id,
      domain,
      status: DomainVerificationStatus.PENDING,
      expiresAt: { lte: now }
    },
    data: { status: DomainVerificationStatus.EXPIRED }
  });

  const existing = await prisma.domainVerification.findFirst({
    where: {
      userId: req.authUser!.id,
      domain,
      method,
      status: DomainVerificationStatus.PENDING,
      expiresAt: { gt: now }
    },
    orderBy: { createdAt: "desc" }
  });

  const challenge = existing
    ? existing
    : await prisma.domainVerification.create({
        data: {
          userId: req.authUser!.id,
          domain,
          method,
          challengeToken: generateVerificationToken(),
          status: DomainVerificationStatus.PENDING,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
        }
      });

  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_VERIFY_REQUESTED",
    targetType: "DOMAIN_VERIFICATION",
    targetId: challenge.id,
    metadata: { domain, method, expiresAt: challenge.expiresAt.toISOString() }
  });

  return res.status(201).json({
    verificationId: challenge.id,
    domain,
    method: challenge.method,
    status: challenge.status,
    expiresAt: challenge.expiresAt,
    instructions:
      challenge.method === DomainVerificationMethod.DNS
        ? {
            type: "DNS",
            name: `_trustlens.${domain}`,
            value: verificationTxtValue(challenge.challengeToken),
            text: `Add TXT record _trustlens.${domain} = ${verificationTxtValue(challenge.challengeToken)}`
          }
        : {
            type: "HTTP",
            url: `https://${domain}/.well-known/trustlens.txt`,
            value: verificationTxtValue(challenge.challengeToken),
            text: `Create https://${domain}/.well-known/trustlens.txt containing ${verificationTxtValue(challenge.challengeToken)}`
          }
  });
});

router.post("/:domain/verify-check", requireAuth, async (req, res) => {
  const rawDomainParam = Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain;
  const domain = normalizeDomain(rawDomainParam || "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "Invalid domain", requestId: req.requestId });
  }

  const challenge = await prisma.domainVerification.findFirst({
    where: {
      userId: req.authUser!.id,
      domain,
      status: DomainVerificationStatus.PENDING
    },
    orderBy: { createdAt: "desc" }
  });
  if (!challenge) {
    await createAdminAuditLog({
      req,
      actorUserId: req.authUser!.id,
      action: "DOMAIN_VERIFY_CHECK_FAILED",
      targetType: "DOMAIN_VERIFICATION",
      targetId: null,
      metadata: { domain, reason: "NO_PENDING_CHALLENGE" }
    });
    return res.status(404).json({ error: "No pending verification challenge", requestId: req.requestId });
  }

  if (isChallengeExpired(challenge.expiresAt)) {
    await prisma.domainVerification.update({
      where: { id: challenge.id },
      data: { status: DomainVerificationStatus.EXPIRED }
    });
    await createAdminAuditLog({
      req,
      actorUserId: req.authUser!.id,
      action: "DOMAIN_VERIFY_CHECK_FAILED",
      targetType: "DOMAIN_VERIFICATION",
      targetId: challenge.id,
      metadata: { domain, reason: "CHALLENGE_EXPIRED" }
    });
    return res.status(400).json({ error: "Challenge expired", requestId: req.requestId });
  }

  const valid = await validateDomainVerification({
    domain,
    token: challenge.challengeToken,
    method: challenge.method
  });

  if (!valid) {
    await prisma.domainVerification.update({
      where: { id: challenge.id },
      data: { status: DomainVerificationStatus.FAILED }
    });
    await createAdminAuditLog({
      req,
      actorUserId: req.authUser!.id,
      action: "DOMAIN_VERIFY_CHECK_FAILED",
      targetType: "DOMAIN_VERIFICATION",
      targetId: challenge.id,
      metadata: { domain, reason: "TOKEN_MISMATCH_OR_NOT_FOUND", method: challenge.method }
    });
    return res.status(400).json({ error: "Verification token not found", requestId: req.requestId });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.domainVerification.update({
      where: { id: challenge.id },
      data: { status: DomainVerificationStatus.VERIFIED, verifiedAt: now }
    }),
    prisma.domainReputation.upsert({
      where: { domain },
      create: {
        domain,
        reputationScore: 0,
        riskLevel: "SAFE",
        confidence: 0.2,
        signals: {},
        counts: {},
        verifiedOwner: true,
        verifiedAt: now
      },
      update: {
        verifiedOwner: true,
        verifiedAt: now
      }
    })
  ]);
  const reputation = await computeDomainReputation(domain);

  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_VERIFIED",
    targetType: "DOMAIN_VERIFICATION",
    targetId: challenge.id,
    metadata: { domain, method: challenge.method, verifiedAt: now.toISOString(), reputationRiskLevel: reputation.riskLevel }
  });

  return res.json({
    success: true,
    verificationId: challenge.id,
    domain,
    method: challenge.method,
    status: DomainVerificationStatus.VERIFIED,
    verifiedAt: now,
    reputation
  });
});

router.get("/:domain/badge.svg", async (req, res) => {
  const domain = normalizeDomain(req.params.domain || "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "Invalid domain", requestId: req.requestId });
  }
  const reputation = await getDomainReputation(domain);
  if (!isBadgeEligible({ verifiedOwner: reputation.verifiedOwner, riskLevel: reputation.riskLevel })) {
    return res.status(403).json({ error: "Badge unavailable", requestId: req.requestId });
  }

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.send(buildVerifiedBadgeSvg(domain));
});

router.post("/:domain/dispute", requireAuth, validate(disputeSchema), async (req, res) => {
  const rawDomainParam = Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain;
  const domain = normalizeDomain(rawDomainParam || "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ error: "Invalid domain", requestId: req.requestId });
  }

  const owned = await prisma.domainVerification.findFirst({
    where: {
      domain,
      userId: req.authUser!.id,
      status: DomainVerificationStatus.VERIFIED
    },
    select: { id: true }
  });
  if (!owned) {
    return res.status(403).json({ error: "Only verified domain owners can submit disputes", requestId: req.requestId });
  }

  const dispute = await prisma.domainDispute.create({
    data: {
      domain,
      userId: req.authUser!.id,
      reason: req.body.reason,
      evidenceUrl: req.body.evidenceUrl,
      status: "OPEN"
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_DISPUTE_CREATED",
    targetType: "DOMAIN_DISPUTE",
    targetId: dispute.id,
    metadata: { domain }
  });
  return res.status(201).json(dispute);
});

export default router;
