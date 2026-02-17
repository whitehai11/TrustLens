import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { validate } from "../middleware/validate";
import { readAuthIfPresent } from "../middleware/readAuthIfPresent";
import { assertNoBlockedContent } from "../services/contentModeration";
import { publish } from "../services/events";
import { computeDomainReputation } from "../services/reputation";

const router = Router();

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const reportSchema = z.object({
  domain: z.string().min(3).max(255).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
  reason: z.preprocess(emptyToUndefined, z.string().max(120).optional()),
  category: z.preprocess(emptyToUndefined, z.string().min(2).max(64)),
  details: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  message: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  evidenceLink: z.preprocess(emptyToUndefined, z.string().url().max(2048).optional()),
  reporterEmail: z.preprocess(emptyToUndefined, z.string().email().optional()),
  email: z.preprocess(emptyToUndefined, z.string().email().optional())
});

router.post("/report", readAuthIfPresent, validate(reportSchema), async (req, res) => {
  const { reason, category, evidenceLink } = req.body;
  const domain = String(req.body.domain).toLowerCase().trim();
  const details = (req.body.details || req.body.description || req.body.message || "").trim();
  const reporterEmail = req.body.reporterEmail || req.body.email;

  if (!details || details.length < 20) {
    return res.status(400).json({ error: "description must be at least 20 characters", requestId: req.requestId });
  }

  if (!req.authUser && !reporterEmail) {
    return res.status(400).json({ error: "reporterEmail is required for guest reports", requestId: req.requestId });
  }
  assertNoBlockedContent([
    { name: "reason", value: reason },
    { name: "category", value: category },
    { name: "description", value: details }
  ]);

  const duplicateWhere = req.authUser
    ? { domain, category, description: details, userId: req.authUser.id }
    : { domain, category, description: details, email: reporterEmail };
  const duplicate = await prisma.domainFeedback.findFirst({
    where: {
      ...duplicateWhere,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    select: { id: true }
  });
  if (duplicate) {
    return res.status(409).json({ error: "Duplicate report detected", requestId: req.requestId });
  }

  const { feedback, report } = await prisma.$transaction(async (tx) => {
    let reputationWeight = 0.5;
    if (req.authUser) {
      reputationWeight = 1.0;
      const [user, approvedCount, hasVerifiedOwnership] = await Promise.all([
        tx.user.findUnique({ where: { id: req.authUser.id }, select: { createdAt: true } }),
        tx.domainFeedback.count({ where: { userId: req.authUser.id, status: "APPROVED" } }),
        tx.domainVerification.count({ where: { userId: req.authUser.id, status: "VERIFIED" } })
      ]);
      if (hasVerifiedOwnership > 0) reputationWeight = 1.5;
      if (user && Date.now() - user.createdAt.getTime() >= 90 * 24 * 60 * 60 * 1000) reputationWeight += 0.2;
      if (approvedCount > 0) reputationWeight += 0.3;
      reputationWeight = Math.min(2.0, reputationWeight);
    }

    const feedback = await tx.domainFeedback.create({
      data: {
        domain,
        category,
        description: details,
        evidenceUrl: evidenceLink,
        email: req.authUser ? undefined : reporterEmail,
        userId: req.authUser?.id,
        reputationWeight,
        status: "PENDING"
      }
    });
    const report = await tx.domainReport.create({
      data: {
        domain,
        reason: reason || category || "General report",
        details,
        category,
        evidenceLink,
        reporterEmail: req.authUser ? undefined : reporterEmail,
        userId: req.authUser?.id,
        moderationStatus: "PENDING"
      }
    });
    return { feedback, report };
  });
  publish({
    type: "REPORT_CREATED",
    correlationId: req.requestId,
    payload: {
      reportId: report.id,
      feedbackId: feedback.id,
      domain: report.domain,
      category: report.category,
      moderationStatus: report.moderationStatus,
      createdByUserId: report.userId
    }
  });
  void computeDomainReputation(domain).catch(() => undefined);

  return res.status(201).json({
    id: report.id,
    feedbackId: feedback.id,
    domain: report.domain,
    category: report.category,
    status: report.moderationStatus,
    createdAt: report.createdAt
  });
});

export default router;
