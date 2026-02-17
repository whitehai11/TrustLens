import { Router } from "express";
import { Request, Response } from "express";
import { z } from "zod";
import {
  AbuseSeverity,
  ApiKeyStatus,
  ApiPlan,
  DomainVerificationStatus,
  IpRuleType,
  ModerationStatus,
  Role,
  TicketAuthorType,
  TicketPriority,
  TicketStatus,
  UserStatus
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { Permissions } from "../constants/permissions";
import { createAdminAuditLog } from "../services/auditLog";
import { generateApiKey, getApiKeyParts, hashApiKey, maskApiKeyFromParts } from "../lib/security";
import { getEventsSince, publish, RealtimeEvent, subscribe } from "../services/events";
import { getRealtimeSnapshot } from "../services/liveMetrics";
import { exportDomainIntel, exportIpIntel, exportKeyIntel, serializeExport } from "../services/exports";
import { threatGraphByDomain, threatGraphByIp, threatGraphByKey } from "../services/threatGraph";
import { computeDomainReputation } from "../services/reputation";
import { recalculateStoredTldStatsFromDomainChecks } from "../services/tldStats";

const router = Router();

const rolePatchSchema = z.object({ role: z.nativeEnum(Role) });
const userStatusPatchSchema = z.object({ status: z.nativeEnum(UserStatus) });
const userTierPatchSchema = z.object({ tier: z.nativeEnum(ApiPlan) });
const userLimitPatchSchema = z.object({ dailyLimit: z.number().int().min(1).max(10000000) });
const keyCreateSchema = z.object({
  userId: z.string().min(1),
  tier: z.nativeEnum(ApiPlan).default(ApiPlan.FREE),
  dailyLimit: z.number().int().min(1).max(10000000).optional()
});
const keyStatusSchema = z.object({ status: z.nativeEnum(ApiKeyStatus) });
const keyTierSchema = z.object({ tier: z.nativeEnum(ApiPlan) });
const keyLimitSchema = z.object({ dailyLimit: z.number().int().min(1).max(10000000) });
const abuseResolveSchema = z.object({ note: z.string().max(500).optional() });
const ipRuleSchema = z.object({
  type: z.nativeEnum(IpRuleType),
  value: z.string().min(3).max(255),
  reason: z.string().min(3).max(500),
  expiresAt: z.string().datetime().optional()
});
const ipRulePatchSchema = z.object({
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().min(3).max(500).optional()
});
const moderationSchema = z.object({ note: z.string().max(2000).optional() });
const feedbackModerationSchema = z.object({ note: z.string().max(2000).optional() });
const ticketStatusSchema = z.object({ status: z.nativeEnum(TicketStatus) });
const ticketAssignSchema = z.object({ assignedToId: z.string().nullable() });
const ticketPrioritySchema = z.object({ priority: z.nativeEnum(TicketPriority) });
const ticketMessageSchema = z.object({ body: z.string().min(1).max(5000) });
const createIncidentSchema = z.object({
  title: z.string().min(3).max(300),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["OPEN", "INVESTIGATING", "CLOSED"]).optional()
});
const incidentLinkSchema = z.object({
  type: z.enum(["DOMAIN", "IP", "API_KEY", "USER", "ABUSE_FLAG"]),
  targetId: z.string().min(1).max(400)
});
const incidentStatusSchema = z.object({
  status: z.enum(["OPEN", "INVESTIGATING", "CLOSED"])
});
const incidentNoteSchema = z.object({
  body: z.string().min(1).max(5000)
});
const verificationRevokeSchema = z.object({ note: z.string().max(500).optional() });
const disputePatchSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED"]),
  adminNote: z.string().max(2000).optional()
});

router.use(requireAuth);

router.get("/realtime/snapshot", requirePermission(Permissions.VIEW_LOGS), async (_req, res) => {
  const snapshot = await getRealtimeSnapshot();
  return res.json(snapshot);
});

router.get("/realtime/stream", requirePermission(Permissions.VIEW_LOGS), async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const writeEvent = (event: RealtimeEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`id: ${event.id}\n`);
    res.write(`data: ${JSON.stringify({ type: event.type, createdAt: event.createdAt, payload: event.payload, correlationId: event.correlationId })}\n\n`);
  };

  const lastEventIdHeader = req.get("last-event-id");
  const lastEventIdQuery = typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined;
  const missed = getEventsSince(lastEventIdHeader || lastEventIdQuery);
  for (const event of missed) writeEvent(event);

  const keepAlive = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15_000);

  const unsubscribe = subscribe((event: RealtimeEvent) => {
    writeEvent(event);
  });

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

router.get("/overview", requirePermission(Permissions.VIEW_LOGS), async (_req, res) => {
  const [usersTotal, usersSuspended, activeKeys, pendingReports, openTickets, unresolvedAbuse, mlAnomalies] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    prisma.apiKey.count({ where: { status: ApiKeyStatus.ACTIVE } }),
    prisma.domainReport.count({ where: { moderationStatus: ModerationStatus.PENDING } }),
    prisma.ticket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.abuseFlag.count({ where: { resolvedAt: null } }),
    prisma.abuseFlag.count({
      where: {
        resolvedAt: null,
        kind: { in: ["ML_ANOMALY_SPIKE", "ML_ENUMERATION", "ML_ERROR_SHIFT"] as unknown as never[] }
      }
    })
  ]);
  return res.json({ usersTotal, usersSuspended, activeKeys, pendingReports, openTickets, unresolvedAbuse, mlAnomalies });
});

router.get("/users", requirePermission(Permissions.MANAGE_USERS), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const role = req.query.role ? (String(req.query.role) as Role) : undefined;
  const status = req.query.status ? (String(req.query.status) as UserStatus) : undefined;
  const users = await prisma.user.findMany({
    where: {
      AND: [
        q ? { email: { contains: q, mode: "insensitive" } } : {},
        role ? { role } : {},
        status ? { status } : {}
      ]
    },
    include: {
      apiKeys: { select: { id: true, tier: true, status: true, dailyLimit: true, prefix: true, last4: true, createdAt: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(
    users.map((u) => ({
      ...u,
      apiKeys: u.apiKeys.map((k) => ({ ...k, keyMasked: maskApiKeyFromParts(k.prefix, k.last4) }))
    }))
  );
});

router.patch("/users/:id/role", requirePermission(Permissions.MANAGE_USERS), validate(rolePatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "User not found", requestId: req.requestId });
  const targetRole = req.body.role as Role;
  const privileged: Role[] = [Role.ADMIN, Role.SUPERADMIN];
  if (
    (privileged.includes(before.role) || privileged.includes(targetRole)) &&
    req.authUser!.role !== Role.SUPERADMIN
  ) {
    return res.status(403).json({ error: "Only superadmin can modify admin roles", requestId: req.requestId });
  }
  const updated = await prisma.user.update({ where: { id }, data: { role: targetRole } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "USER_ROLE_CHANGED",
    targetType: "USER",
    targetId: id,
    metadata: { before: before.role, after: updated.role }
  });
  return res.json(updated);
});

router.patch("/users/:id/status", requirePermission(Permissions.MANAGE_USERS), validate(userStatusPatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "User not found", requestId: req.requestId });
  const updated = await prisma.user.update({ where: { id }, data: { status: req.body.status } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "USER_STATUS_CHANGED",
    targetType: "USER",
    targetId: id,
    metadata: { before: before.status, after: updated.status }
  });
  return res.json(updated);
});

router.patch("/users/:id/tier", requirePermission(Permissions.MANAGE_TIERS), validate(userTierPatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findMany({ where: { userId: id } });
  await prisma.apiKey.updateMany({ where: { userId: id }, data: { tier: req.body.tier } });
  const updated = await prisma.apiKey.findMany({ where: { userId: id } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "USER_TIER_CHANGED",
    targetType: "USER",
    targetId: id,
    metadata: { before: before.map((k) => ({ id: k.id, tier: k.tier })), after: updated.map((k) => ({ id: k.id, tier: k.tier })) }
  });
  return res.json({ updatedCount: updated.length });
});

router.patch("/users/:id/limit", requirePermission(Permissions.MANAGE_TIERS), validate(userLimitPatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findMany({ where: { userId: id } });
  await prisma.apiKey.updateMany({ where: { userId: id }, data: { dailyLimit: req.body.dailyLimit } });
  const updated = await prisma.apiKey.findMany({ where: { userId: id } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "USER_LIMIT_CHANGED",
    targetType: "USER",
    targetId: id,
    metadata: {
      before: before.map((k) => ({ id: k.id, dailyLimit: k.dailyLimit })),
      after: updated.map((k) => ({ id: k.id, dailyLimit: k.dailyLimit }))
    }
  });
  return res.json({ updatedCount: updated.length });
});

router.get("/keys", requirePermission(Permissions.MANAGE_KEYS), async (_req, res) => {
  const keys = await prisma.apiKey.findMany({
    include: { user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" }
  });
  return res.json(
    keys.map((k) => ({
      ...k,
      hash: undefined,
      keyMasked: maskApiKeyFromParts(k.prefix, k.last4)
    }))
  );
});

router.post("/keys", requirePermission(Permissions.MANAGE_KEYS), validate(keyCreateSchema), async (req, res) => {
  const fullKey = generateApiKey();
  const { prefix, last4 } = getApiKeyParts(fullKey);
  const hash = await hashApiKey(fullKey);
  const tierLimit = await prisma.planLimit.findUnique({ where: { plan: req.body.tier } });
  const key = await prisma.apiKey.create({
    data: {
      userId: req.body.userId,
      tier: req.body.tier,
      status: ApiKeyStatus.ACTIVE,
      dailyLimit: req.body.dailyLimit ?? tierLimit?.requestsPerDay ?? 200,
      prefix,
      last4,
      hash
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "KEY_CREATED",
    targetType: "API_KEY",
    targetId: key.id,
    metadata: { userId: req.body.userId, tier: key.tier, dailyLimit: key.dailyLimit }
  });
  publish({
    type: "KEY_STATUS_CHANGED",
    correlationId: req.requestId,
    payload: {
      action: "CREATED",
      apiKeyId: key.id,
      maskedKey: maskApiKeyFromParts(key.prefix, key.last4),
      status: key.status
    }
  });
  return res.status(201).json({ ...key, hash: undefined, key: fullKey, keyMasked: maskApiKeyFromParts(prefix, last4) });
});

router.patch("/keys/:id/status", requirePermission(Permissions.MANAGE_KEYS), validate(keyStatusSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Key not found", requestId: req.requestId });
  const updated = await prisma.apiKey.update({ where: { id }, data: { status: req.body.status } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "KEY_STATUS_CHANGED",
    targetType: "API_KEY",
    targetId: id,
    metadata: { before: before.status, after: updated.status }
  });
  publish({
    type: "KEY_STATUS_CHANGED",
    correlationId: req.requestId,
    payload: {
      action: "STATUS_UPDATED",
      apiKeyId: updated.id,
      maskedKey: maskApiKeyFromParts(updated.prefix, updated.last4),
      status: updated.status
    }
  });
  return res.json({ ...updated, hash: undefined, keyMasked: maskApiKeyFromParts(updated.prefix, updated.last4) });
});

router.patch("/keys/:id/tier", requirePermission(Permissions.MANAGE_TIERS), validate(keyTierSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Key not found", requestId: req.requestId });
  const updated = await prisma.apiKey.update({ where: { id }, data: { tier: req.body.tier } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "KEY_TIER_CHANGED",
    targetType: "API_KEY",
    targetId: id,
    metadata: { before: before.tier, after: updated.tier }
  });
  return res.json({ ...updated, hash: undefined, keyMasked: maskApiKeyFromParts(updated.prefix, updated.last4) });
});

router.patch("/keys/:id/limit", requirePermission(Permissions.MANAGE_TIERS), validate(keyLimitSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Key not found", requestId: req.requestId });
  const updated = await prisma.apiKey.update({ where: { id }, data: { dailyLimit: req.body.dailyLimit } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "KEY_LIMIT_CHANGED",
    targetType: "API_KEY",
    targetId: id,
    metadata: { before: before.dailyLimit, after: updated.dailyLimit }
  });
  return res.json({ ...updated, hash: undefined, keyMasked: maskApiKeyFromParts(updated.prefix, updated.last4) });
});

router.post("/keys/:id/regenerate", requirePermission(Permissions.MANAGE_KEYS), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.apiKey.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Key not found", requestId: req.requestId });
  const fullKey = generateApiKey();
  const { prefix, last4 } = getApiKeyParts(fullKey);
  const hash = await hashApiKey(fullKey);
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { prefix, last4, hash, status: ApiKeyStatus.ACTIVE }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "KEY_REGENERATED",
    targetType: "API_KEY",
    targetId: id,
    metadata: { before: maskApiKeyFromParts(before.prefix, before.last4), after: maskApiKeyFromParts(prefix, last4) }
  });
  publish({
    type: "KEY_STATUS_CHANGED",
    correlationId: req.requestId,
    payload: {
      action: "REGENERATED",
      apiKeyId: updated.id,
      maskedKey: maskApiKeyFromParts(updated.prefix, updated.last4),
      status: updated.status
    }
  });
  return res.json({ ...updated, hash: undefined, key: fullKey, keyMasked: maskApiKeyFromParts(prefix, last4) });
});

router.get("/logs", requirePermission(Permissions.VIEW_LOGS), async (req, res) => {
  const q = req.query;
  const logs = await prisma.apiRequestLog.findMany({
    where: {
      endpoint: q.endpoint ? String(q.endpoint) : undefined,
      method: q.method ? String(q.method) : undefined,
      ipAddress: q.ipAddress ? String(q.ipAddress) : undefined,
      apiKeyId: q.apiKeyId ? String(q.apiKeyId) : undefined,
      domain: q.domain ? String(q.domain) : undefined
    },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  return res.json(logs);
});

router.get("/keys/:id/logs", requirePermission(Permissions.VIEW_LOGS), async (req, res) => {
  const logs = await prisma.apiRequestLog.findMany({
    where: { apiKeyId: String(req.params.id) },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  return res.json(logs);
});

router.get("/abuse", requirePermission(Permissions.VIEW_LOGS), async (req, res) => {
  const severity = req.query.severity ? (String(req.query.severity) as AbuseSeverity) : undefined;
  const unresolvedOnly = req.query.unresolved === "true";
  const rows = await prisma.abuseFlag.findMany({
    where: {
      severity,
      resolvedAt: unresolvedOnly ? null : undefined
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(rows);
});

router.post("/abuse/:id/resolve", requirePermission(Permissions.RESOLVE_ABUSE), validate(abuseResolveSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.abuseFlag.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Abuse flag not found", requestId: req.requestId });
  const updated = await prisma.abuseFlag.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedById: req.authUser!.id }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "ABUSE_FLAG_RESOLVED",
    targetType: "ABUSE_FLAG",
    targetId: id,
    metadata: { note: req.body.note }
  });
  return res.json(updated);
});

router.get("/ip-rules", requirePermission(Permissions.MANAGE_BLOCKS), async (_req, res) => {
  const rules = await prisma.ipRule.findMany({ orderBy: { createdAt: "desc" } });
  return res.json(rules);
});

router.post("/ip-rules", requirePermission(Permissions.MANAGE_BLOCKS), validate(ipRuleSchema), async (req, res) => {
  const rule = await prisma.ipRule.create({
    data: {
      type: req.body.type,
      value: req.body.value,
      reason: req.body.reason,
      createdById: req.authUser!.id,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "IP_RULE_CREATED",
    targetType: "IP_RULE",
    targetId: rule.id,
    metadata: { type: rule.type, value: rule.value }
  });
  publish({
    type: "IP_RULE_CHANGED",
    correlationId: req.requestId,
    payload: { action: "CREATED", ipRuleId: rule.id, type: rule.type, value: rule.value, active: rule.active }
  });
  return res.status(201).json(rule);
});

router.patch("/ip-rules/:id", requirePermission(Permissions.MANAGE_BLOCKS), validate(ipRulePatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.ipRule.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "IP rule not found", requestId: req.requestId });
  const updated = await prisma.ipRule.update({
    where: { id },
    data: {
      active: req.body.active,
      expiresAt: req.body.expiresAt === null ? null : req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      reason: req.body.reason
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "IP_RULE_UPDATED",
    targetType: "IP_RULE",
    targetId: id,
    metadata: { before, after: updated }
  });
  publish({
    type: "IP_RULE_CHANGED",
    correlationId: req.requestId,
    payload: { action: "UPDATED", ipRuleId: updated.id, type: updated.type, value: updated.value, active: updated.active }
  });
  return res.json(updated);
});

router.delete("/ip-rules/:id", requirePermission(Permissions.MANAGE_BLOCKS), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.ipRule.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "IP rule not found", requestId: req.requestId });
  await prisma.ipRule.delete({ where: { id } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "IP_RULE_DELETED",
    targetType: "IP_RULE",
    targetId: id,
    metadata: { before }
  });
  publish({
    type: "IP_RULE_CHANGED",
    correlationId: req.requestId,
    payload: { action: "DELETED", ipRuleId: before.id, type: before.type, value: before.value, active: false }
  });
  return res.status(204).send();
});

router.get("/reports", requirePermission(Permissions.MODERATE_REPORTS), async (req, res) => {
  const status = req.query.status ? (String(req.query.status) as ModerationStatus) : undefined;
  const reports = await prisma.domainReport.findMany({
    where: { moderationStatus: status },
    include: { user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" }
  });
  return res.json(reports);
});

async function moderateReport(req: Request, res: Response, status: ModerationStatus, action: string) {
  const id = String(req.params.id);
  const before = await prisma.domainReport.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Report not found", requestId: req.requestId });
  const updated = await prisma.domainReport.update({
    where: { id },
    data: {
      moderationStatus: status,
      moderatedAt: new Date(),
      moderatedById: req.authUser!.id,
      moderatorNote: req.body.note
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action,
    targetType: "REPORT",
    targetId: id,
    metadata: { before: before.moderationStatus, after: status, note: req.body.note }
  });
  publish({
    type: "REPORT_MODERATED",
    correlationId: req.requestId,
    payload: { reportId: updated.id, domain: updated.domain, moderationStatus: updated.moderationStatus }
  });
  void computeDomainReputation(updated.domain).catch(() => undefined);
  return res.json(updated);
}

router.post("/reports/:id/approve", requirePermission(Permissions.MODERATE_REPORTS), validate(moderationSchema), async (req, res) =>
  moderateReport(req, res, ModerationStatus.APPROVED, "REPORT_APPROVED")
);
router.post("/reports/:id/reject", requirePermission(Permissions.MODERATE_REPORTS), validate(moderationSchema), async (req, res) =>
  moderateReport(req, res, ModerationStatus.REJECTED, "REPORT_REJECTED")
);
router.post("/reports/:id/needs-info", requirePermission(Permissions.MODERATE_REPORTS), validate(moderationSchema), async (req, res) =>
  moderateReport(req, res, ModerationStatus.NEEDS_INFO, "REPORT_NEEDS_INFO")
);

router.get("/feedback", requirePermission(Permissions.MODERATE_REPORTS), async (req, res) => {
  const status = req.query.status ? (String(req.query.status) as ModerationStatus) : undefined;
  const domain = req.query.domain ? String(req.query.domain).toLowerCase() : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const rows = await prisma.domainFeedback.findMany({
    where: {
      status,
      domain,
      category: category ? { equals: category, mode: "insensitive" } : undefined
    },
    include: {
      user: { select: { id: true, email: true, role: true } },
      moderatedBy: { select: { id: true, email: true, role: true } },
      _count: { select: { votes: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  return res.json(rows);
});

async function moderateFeedback(req: Request, res: Response, status: ModerationStatus, action: string) {
  const id = String(req.params.id);
  const before = await prisma.domainFeedback.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Feedback not found", requestId: req.requestId });
  const updated = await prisma.domainFeedback.update({
    where: { id },
    data: {
      status,
      moderatedAt: new Date(),
      moderatedById: req.authUser!.id,
      moderatorNote: req.body.note
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action,
    targetType: "DOMAIN_FEEDBACK",
    targetId: id,
    metadata: { before: before.status, after: status, note: req.body.note, domain: before.domain }
  });
  const reputation = await computeDomainReputation(updated.domain);
  publish({
    type: "REPORT_MODERATED",
    correlationId: req.requestId,
    payload: {
      feedbackId: updated.id,
      domain: updated.domain,
      moderationStatus: updated.status,
      reputationScore: reputation.reputationScore
    }
  });
  return res.json(updated);
}

router.post("/feedback/:id/approve", requirePermission(Permissions.MODERATE_REPORTS), validate(feedbackModerationSchema), async (req, res) =>
  moderateFeedback(req, res, ModerationStatus.APPROVED, "DOMAIN_FEEDBACK_APPROVED")
);
router.post("/feedback/:id/reject", requirePermission(Permissions.MODERATE_REPORTS), validate(feedbackModerationSchema), async (req, res) =>
  moderateFeedback(req, res, ModerationStatus.REJECTED, "DOMAIN_FEEDBACK_REJECTED")
);

router.get("/domain/:domain/reputation/recompute", requirePermission(Permissions.MODERATE_REPORTS), async (req, res) => {
  const domain = String(req.params.domain).toLowerCase().trim();
  const reputation = await computeDomainReputation(domain);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_REPUTATION_RECOMPUTED",
    targetType: "DOMAIN",
    targetId: domain,
    metadata: { reputationScore: reputation.reputationScore, riskLevel: reputation.riskLevel }
  });
  return res.json(reputation);
});

router.get("/domain-verifications", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const status = req.query.status ? (String(req.query.status) as DomainVerificationStatus) : undefined;
  const domain = req.query.domain ? String(req.query.domain).toLowerCase() : undefined;
  const rows = await prisma.domainVerification.findMany({
    where: { status, domain },
    include: { user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  return res.json(rows);
});

router.post("/domain-verifications/:id/approve", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.domainVerification.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Verification not found", requestId: req.requestId });
  const now = new Date();
  const updated = await prisma.domainVerification.update({
    where: { id },
    data: {
      status: DomainVerificationStatus.VERIFIED,
      verifiedAt: now
    }
  });
  await prisma.domainReputation.upsert({
    where: { domain: updated.domain },
    create: {
      domain: updated.domain,
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
  });
  await computeDomainReputation(updated.domain);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_VERIFICATION_APPROVED",
    targetType: "DOMAIN_VERIFICATION",
    targetId: id,
    metadata: { before: before.status, after: updated.status, domain: updated.domain }
  });
  return res.json(updated);
});

router.patch("/domain-verifications/:id/revoke", requireRole("ADMIN", "SUPERADMIN"), validate(verificationRevokeSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.domainVerification.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Verification not found", requestId: req.requestId });

  const updated = await prisma.domainVerification.update({
    where: { id },
    data: {
      status: DomainVerificationStatus.FAILED,
      verifiedAt: null
    }
  });
  await prisma.domainReputation.updateMany({
    where: { domain: updated.domain },
    data: {
      verifiedOwner: false,
      verifiedAt: null
    }
  });
  await computeDomainReputation(updated.domain);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_VERIFICATION_REVOKED",
    targetType: "DOMAIN_VERIFICATION",
    targetId: id,
    metadata: { before: before.status, after: updated.status, domain: updated.domain, note: req.body.note }
  });
  return res.json(updated);
});

router.get("/disputes", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const rows = await prisma.domainDispute.findMany({
    where: { status: status as never },
    include: { user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  return res.json(rows);
});

router.patch("/disputes/:id", requireRole("ADMIN", "SUPERADMIN"), validate(disputePatchSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.domainDispute.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Dispute not found", requestId: req.requestId });
  const updated = await prisma.domainDispute.update({
    where: { id },
    data: {
      status: req.body.status,
      adminNote: req.body.adminNote,
      resolvedAt: req.body.status === "RESOLVED" || req.body.status === "REJECTED" ? new Date() : null
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "DOMAIN_DISPUTE_UPDATED",
    targetType: "DOMAIN_DISPUTE",
    targetId: id,
    metadata: { before: { status: before.status, adminNote: before.adminNote }, after: { status: updated.status, adminNote: updated.adminNote } }
  });
  return res.json(updated);
});

router.post("/tld/recalculate", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const rows = await recalculateStoredTldStatsFromDomainChecks();
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "TLD_STATS_RECALCULATED",
    targetType: "TLD_STATS",
    targetId: null,
    metadata: { rows: rows.length }
  });
  return res.json({ ok: true, rows: rows.length });
});

router.get("/tickets", requirePermission(Permissions.MANAGE_TICKETS), async (req, res) => {
  const status = req.query.status ? (String(req.query.status) as TicketStatus) : undefined;
  const priority = req.query.priority ? (String(req.query.priority) as TicketPriority) : undefined;
  const tickets = await prisma.ticket.findMany({
    where: { status, priority },
    include: {
      user: { select: { id: true, email: true, role: true } },
      assignedTo: { select: { id: true, email: true, role: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, email: true, role: true } } } }
    },
    orderBy: { updatedAt: "desc" }
  });
  return res.json(tickets);
});

router.post("/tickets/:id/messages", requirePermission(Permissions.MANAGE_TICKETS), validate(ticketMessageSchema), async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: String(req.params.id) } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found", requestId: req.requestId });
  const msg = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: TicketAuthorType.STAFF,
      authorId: req.authUser!.id,
      body: req.body.body
    }
  });
  await prisma.ticket.update({ where: { id: ticket.id }, data: { status: TicketStatus.IN_PROGRESS } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "TICKET_REPLIED",
    targetType: "TICKET",
    targetId: ticket.id,
    metadata: { messageId: msg.id }
  });
  publish({
    type: "TICKET_UPDATED",
    correlationId: req.requestId,
    payload: {
      ticketId: ticket.id,
      action: "STAFF_MESSAGE_ADDED",
      messageId: msg.id,
      status: TicketStatus.IN_PROGRESS
    }
  });
  return res.status(201).json(msg);
});

router.patch("/tickets/:id/status", requirePermission(Permissions.MANAGE_TICKETS), validate(ticketStatusSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Ticket not found", requestId: req.requestId });
  const updated = await prisma.ticket.update({ where: { id }, data: { status: req.body.status } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "TICKET_STATUS_CHANGED",
    targetType: "TICKET",
    targetId: id,
    metadata: { before: before.status, after: updated.status }
  });
  publish({
    type: "TICKET_UPDATED",
    correlationId: req.requestId,
    payload: { ticketId: updated.id, action: "STATUS_CHANGED", status: updated.status }
  });
  return res.json(updated);
});

router.patch("/tickets/:id/assign", requirePermission(Permissions.MANAGE_TICKETS), validate(ticketAssignSchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Ticket not found", requestId: req.requestId });
  const updated = await prisma.ticket.update({ where: { id }, data: { assignedToId: req.body.assignedToId } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "TICKET_ASSIGNED",
    targetType: "TICKET",
    targetId: id,
    metadata: { before: before.assignedToId, after: updated.assignedToId }
  });
  publish({
    type: "TICKET_UPDATED",
    correlationId: req.requestId,
    payload: { ticketId: updated.id, action: "ASSIGNED", assignedToId: updated.assignedToId }
  });
  return res.json(updated);
});

router.patch("/tickets/:id/priority", requirePermission(Permissions.MANAGE_TICKETS), validate(ticketPrioritySchema), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.ticket.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Ticket not found", requestId: req.requestId });
  const updated = await prisma.ticket.update({ where: { id }, data: { priority: req.body.priority } });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "TICKET_PRIORITY_CHANGED",
    targetType: "TICKET",
    targetId: id,
    metadata: { before: before.priority, after: updated.priority }
  });
  publish({
    type: "TICKET_UPDATED",
    correlationId: req.requestId,
    payload: { ticketId: updated.id, action: "PRIORITY_CHANGED", priority: updated.priority }
  });
  return res.json(updated);
});

router.get("/domain/:domain/history", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const domain = String(req.params.domain).toLowerCase();
  const history = await prisma.domainHistory.findMany({
    where: { domain },
    orderBy: { createdAt: "desc" },
    take: 1000
  });
  return res.json(history);
});

router.get("/ip/:ip/history", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const ip = String(req.params.ip);
  const history = await prisma.ipActivity.findMany({
    where: { ipAddress: ip },
    orderBy: { createdAt: "desc" },
    take: 2000
  });
  return res.json(history);
});

router.get("/intel/domain/:domain", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const graph = await threatGraphByDomain(String(req.params.domain).toLowerCase());
  return res.json(graph);
});

router.get("/intel/ip/:ip", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const graph = await threatGraphByIp(String(req.params.ip));
  return res.json(graph);
});

router.get("/intel/key/:keyId", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const graph = await threatGraphByKey(String(req.params.keyId));
  return res.json(graph);
});

router.get("/incidents", requireRole("ADMIN", "SUPERADMIN"), async (_req, res) => {
  const incidents = await prisma.incident.findMany({
    include: { links: true, notes: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" }
  });
  return res.json(incidents);
});

router.post("/incidents", requireRole("ADMIN", "SUPERADMIN"), validate(createIncidentSchema), async (req, res) => {
  const incident = await prisma.incident.create({
    data: {
      title: req.body.title,
      severity: req.body.severity,
      status: req.body.status || "OPEN",
      createdById: req.authUser!.id
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "INCIDENT_CREATED",
    targetType: "INCIDENT",
    targetId: incident.id,
    metadata: { title: incident.title, severity: incident.severity }
  });
  publish({
    type: "INCIDENT_CHANGED",
    correlationId: req.requestId,
    payload: { action: "CREATED", incidentId: incident.id, severity: incident.severity, status: incident.status }
  });
  return res.status(201).json(incident);
});

router.post("/incidents/:id/links", requireRole("ADMIN", "SUPERADMIN"), validate(incidentLinkSchema), async (req, res) => {
  const incidentId = String(req.params.id);
  const link = await prisma.incidentLink.create({
    data: {
      incidentId,
      type: req.body.type,
      targetId: req.body.targetId
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "INCIDENT_LINK_ADDED",
    targetType: "INCIDENT",
    targetId: incidentId,
    metadata: { linkType: link.type, targetId: link.targetId }
  });
  publish({
    type: "INCIDENT_CHANGED",
    correlationId: req.requestId,
    payload: { action: "LINK_ADDED", incidentId, linkType: link.type, targetId: link.targetId }
  });
  return res.status(201).json(link);
});

router.post("/incidents/:id/notes", requireRole("ADMIN", "SUPERADMIN"), validate(incidentNoteSchema), async (req, res) => {
  const incidentId = String(req.params.id);
  const note = await prisma.incidentNote.create({
    data: {
      incidentId,
      authorId: req.authUser!.id,
      body: req.body.body
    }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "INCIDENT_NOTE_ADDED",
    targetType: "INCIDENT",
    targetId: incidentId,
    metadata: { noteId: note.id }
  });
  publish({
    type: "INCIDENT_CHANGED",
    correlationId: req.requestId,
    payload: { action: "NOTE_ADDED", incidentId, noteId: note.id }
  });
  return res.status(201).json(note);
});

router.patch("/incidents/:id/status", requireRole("ADMIN", "SUPERADMIN"), validate(incidentStatusSchema), async (req, res) => {
  const incidentId = String(req.params.id);
  const before = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!before) return res.status(404).json({ error: "Incident not found", requestId: req.requestId });
  const updated = await prisma.incident.update({
    where: { id: incidentId },
    data: { status: req.body.status }
  });
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "INCIDENT_STATUS_CHANGED",
    targetType: "INCIDENT",
    targetId: incidentId,
    metadata: { before: before.status, after: updated.status }
  });
  publish({
    type: "INCIDENT_CHANGED",
    correlationId: req.requestId,
    payload: { action: "STATUS_CHANGED", incidentId, status: updated.status }
  });
  return res.json(updated);
});

router.get("/export/domain/:domain", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const domain = String(req.params.domain).toLowerCase();
  const format = (String(req.query.format || "json").toLowerCase() === "csv" ? "csv" : "json") as "json" | "csv";
  const payload = await exportDomainIntel(domain);
  const out = serializeExport(payload, format);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "EXPORT_DOMAIN_INTEL",
    targetType: "DOMAIN",
    targetId: domain,
    metadata: { format }
  });
  res.setHeader("Content-Type", out.contentType);
  return res.send(out.body);
});

router.get("/export/ip/:ip", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const ip = String(req.params.ip);
  const format = (String(req.query.format || "json").toLowerCase() === "csv" ? "csv" : "json") as "json" | "csv";
  const payload = await exportIpIntel(ip);
  const out = serializeExport(payload, format);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "EXPORT_IP_INTEL",
    targetType: "IP",
    targetId: ip,
    metadata: { format }
  });
  res.setHeader("Content-Type", out.contentType);
  return res.send(out.body);
});

router.get("/export/key/:keyId", requireRole("ADMIN", "SUPERADMIN"), async (req, res) => {
  const keyId = String(req.params.keyId);
  const format = (String(req.query.format || "json").toLowerCase() === "csv" ? "csv" : "json") as "json" | "csv";
  const payload = await exportKeyIntel(keyId);
  const out = serializeExport(payload, format);
  await createAdminAuditLog({
    req,
    actorUserId: req.authUser!.id,
    action: "EXPORT_KEY_INTEL",
    targetType: "API_KEY",
    targetId: keyId,
    metadata: { format }
  });
  res.setHeader("Content-Type", out.contentType);
  return res.send(out.body);
});

export default router;
