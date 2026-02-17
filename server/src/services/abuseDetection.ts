import { AbuseKind, AbuseSeverity, ApiKeyStatus, IpRuleType, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { publish } from "./events";
import { maskApiKeyFromParts } from "../lib/security";
import { runMlAnomalyDetection } from "./mlAnomaly";

let timer: NodeJS.Timeout | null = null;

function since(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function createFlag(input: {
  kind: AbuseKind;
  severity: AbuseSeverity;
  apiKeyId?: string;
  ipAddress?: string;
  details: Record<string, unknown>;
  correlationId?: string;
}) {
  const created = await prisma.abuseFlag.create({
    data: {
      kind: input.kind,
      severity: input.severity,
      apiKeyId: input.apiKeyId,
      ipAddress: input.ipAddress,
      details: input.details as Prisma.InputJsonValue,
      correlationId: input.correlationId
    }
  });
  publish({
    type: "ABUSE_FLAG_CREATED",
    payload: {
      flagId: created.id,
      kind: created.kind,
      severity: created.severity,
      apiKeyId: created.apiKeyId,
      ipAddress: created.ipAddress,
      domain: typeof input.details.domain === "string" ? input.details.domain : null
    }
  });

  if (created.severity === AbuseSeverity.HIGH) {
    const recentHigh = await prisma.abuseFlag.count({
      where: {
        severity: AbuseSeverity.HIGH,
        resolvedAt: null,
        createdAt: { gte: since(30) },
        OR: [{ ipAddress: created.ipAddress ?? undefined }, { apiKeyId: created.apiKeyId ?? undefined }]
      }
    });
    if (recentHigh >= 3) {
      const incident = await prisma.incident.create({
        data: {
          title: `Automated incident: repeated high-severity abuse (${created.kind})`,
          severity: "HIGH",
          status: "OPEN",
          createdById: env.systemActorUserId
        }
      });
      if (created.ipAddress) {
        await prisma.incidentLink.create({ data: { incidentId: incident.id, type: "IP", targetId: created.ipAddress } });
      }
      if (created.apiKeyId) {
        await prisma.incidentLink.create({ data: { incidentId: incident.id, type: "API_KEY", targetId: created.apiKeyId } });
      }
      await prisma.incidentLink.create({ data: { incidentId: incident.id, type: "ABUSE_FLAG", targetId: created.id } });
    }
  }
}

async function detectIpSpike() {
  const rows = await prisma.apiRequestLog.groupBy({
    by: ["ipAddress"],
    where: { createdAt: { gte: since(5) } },
    _count: { ipAddress: true }
  });
  for (const row of rows) {
    if (row._count.ipAddress <= 100) continue;
    await createFlag({
      kind: AbuseKind.IP_SPIKE,
      severity: row._count.ipAddress > 180 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
      ipAddress: row.ipAddress,
      details: { requestsIn5m: row._count.ipAddress }
    });
    if (env.autoBlockIpOnHighAbuse && row._count.ipAddress > 180) {
      const rule = await prisma.ipRule.create({
        data: {
          type: IpRuleType.BLOCK,
          value: row.ipAddress,
          reason: "Auto-blocked by abuse detector",
          createdById: env.systemActorUserId,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });
      publish({
        type: "IP_RULE_CHANGED",
        payload: { action: "AUTO_BLOCK", ipRuleId: rule.id, type: rule.type, value: rule.value, active: rule.active }
      });
    }
  }
}

async function detectKeySpike() {
  const keys = await prisma.apiKey.findMany({ where: { status: ApiKeyStatus.ACTIVE } });
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (const key of keys) {
    const used = await prisma.apiRequestLog.count({
      where: { apiKeyId: key.id, createdAt: { gte: start } }
    });
    const ratio = key.dailyLimit > 0 ? used / key.dailyLimit : 0;
    if (ratio < 0.8) continue;
    const severity = ratio >= 1 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM;
    await createFlag({
      kind: AbuseKind.KEY_SPIKE,
      severity,
      apiKeyId: key.id,
      details: { usedToday: used, dailyLimit: key.dailyLimit, ratio }
    });
    if (env.autoSuspendKeyOnHighAbuse && severity === AbuseSeverity.HIGH) {
      const updated = await prisma.apiKey.update({
        where: { id: key.id },
        data: { status: ApiKeyStatus.SUSPENDED }
      });
      publish({
        type: "KEY_STATUS_CHANGED",
        payload: {
          action: "AUTO_SUSPEND",
          apiKeyId: updated.id,
          maskedKey: maskApiKeyFromParts(updated.prefix, updated.last4),
          status: updated.status
        }
      });
    }
  }
}

async function detectErrorRate() {
  const rows = await prisma.apiRequestLog.groupBy({
    by: ["ipAddress"],
    where: { createdAt: { gte: since(10) } },
    _count: { ipAddress: true }
  });

  for (const row of rows) {
    if (row._count.ipAddress < 20) continue;
    const total = row._count.ipAddress;
    const errors = await prisma.apiRequestLog.count({
      where: {
        ipAddress: row.ipAddress,
        createdAt: { gte: since(10) },
        statusCode: { gte: 400 }
      }
    });
    const rate = errors / total;
    if (rate <= 0.3) continue;
    await createFlag({
      kind: AbuseKind.ERROR_RATE,
      severity: rate > 0.6 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
      ipAddress: row.ipAddress,
      details: { total, errors, rate }
    });
  }
}

async function detectDomainFlood() {
  const rows = await prisma.apiRequestLog.groupBy({
    by: ["domain", "ipAddress", "apiKeyId"],
    where: { createdAt: { gte: since(10) }, endpoint: { contains: "/api/domain/check" }, domain: { not: null } },
    _count: { domain: true }
  });

  for (const row of rows) {
    if (!row.domain || row._count.domain <= 50) continue;
    await createFlag({
      kind: AbuseKind.DOMAIN_FLOOD,
      severity: row._count.domain > 100 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
      apiKeyId: row.apiKeyId ?? undefined,
      ipAddress: row.ipAddress,
      details: { domain: row.domain, count: row._count.domain }
    });
  }
}

async function detectMultiKeyPerIp() {
  const rows = await prisma.apiRequestLog.groupBy({
    by: ["ipAddress"],
    where: { createdAt: { gte: since(10) }, apiKeyId: { not: null } },
    _count: { apiKeyId: true }
  });
  for (const row of rows) {
    const keys = await prisma.apiRequestLog.findMany({
      where: { ipAddress: row.ipAddress, createdAt: { gte: since(10) }, apiKeyId: { not: null } },
      select: { apiKeyId: true }
    });
    const distinctKeys = new Set(keys.map((k) => k.apiKeyId).filter(Boolean));
    if (distinctKeys.size >= 4) {
      await createFlag({
        kind: AbuseKind.MULTI_KEY_IP,
        severity: distinctKeys.size >= 8 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
        ipAddress: row.ipAddress,
        details: { distinctApiKeysIn10m: distinctKeys.size }
      });
    }
  }
}

async function detectDomainKeyFanout() {
  const domains = await prisma.apiRequestLog.groupBy({
    by: ["domain"],
    where: { createdAt: { gte: since(15) }, domain: { not: null }, apiKeyId: { not: null } },
    _count: { domain: true }
  });
  for (const row of domains) {
    if (!row.domain) continue;
    const keyRows = await prisma.apiRequestLog.findMany({
      where: { domain: row.domain, createdAt: { gte: since(15) }, apiKeyId: { not: null } },
      select: { apiKeyId: true }
    });
    const distinctKeys = new Set(keyRows.map((k) => k.apiKeyId).filter(Boolean));
    if (distinctKeys.size >= 6) {
      await createFlag({
        kind: AbuseKind.DOMAIN_KEY_FANOUT,
        severity: distinctKeys.size >= 12 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
        details: { domain: row.domain, distinctKeysIn15m: distinctKeys.size }
      });
    }
  }
}

async function detectBurstAndEnumeration() {
  const ipRows = await prisma.apiRequestLog.groupBy({
    by: ["ipAddress"],
    where: { createdAt: { gte: since(2) }, endpoint: { contains: "/api/domain/check" } },
    _count: { ipAddress: true }
  });
  for (const row of ipRows) {
    if (row._count.ipAddress >= 40) {
      await createFlag({
        kind: AbuseKind.BURST_SCAN,
        severity: row._count.ipAddress >= 80 ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
        ipAddress: row.ipAddress,
        details: { checksIn2m: row._count.ipAddress }
      });
    }

    const domains = await prisma.apiRequestLog.findMany({
      where: { ipAddress: row.ipAddress, createdAt: { gte: since(2) }, endpoint: { contains: "/api/domain/check" }, domain: { not: null } },
      select: { domain: true }
    });
    const labels = domains.map((d) => (d.domain || "").split(".")[0]).filter(Boolean).sort();
    let sequentialHits = 0;
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const cur = labels[i];
      if (prev && cur && prev.length === cur.length) {
        let diff = 0;
        for (let j = 0; j < prev.length; j++) if (prev[j] !== cur[j]) diff += 1;
        if (diff === 1) sequentialHits += 1;
      }
    }
    if (sequentialHits >= 10) {
      await createFlag({
        kind: AbuseKind.DOMAIN_ENUMERATION,
        severity: AbuseSeverity.HIGH,
        ipAddress: row.ipAddress,
        details: { sequentialHits, checkedDomains: labels.length }
      });
    }
  }
}

async function detectMlAnomalies() {
  const detections = runMlAnomalyDetection();
  for (const detection of detections) {
    await createFlag({
      kind: detection.kind,
      severity: detection.severity,
      apiKeyId: detection.apiKeyId,
      ipAddress: detection.ipAddress,
      details: {
        ...detection.details,
        source: "EWMA_ZSCORE",
        entityType: detection.entityType,
        entityId: detection.entityId
      }
    });

    if (env.autoSuspendOnMlHigh && detection.entityType === "API_KEY" && detection.severity === AbuseSeverity.HIGH) {
      const key = await prisma.apiKey.findUnique({ where: { id: detection.entityId } });
      if (key && key.status === ApiKeyStatus.ACTIVE) {
        const updated = await prisma.apiKey.update({
          where: { id: detection.entityId },
          data: { status: ApiKeyStatus.SUSPENDED }
        });
        publish({
          type: "KEY_STATUS_CHANGED",
          payload: {
            action: "AUTO_SUSPEND_ML",
            apiKeyId: updated.id,
            maskedKey: maskApiKeyFromParts(updated.prefix, updated.last4),
            status: updated.status
          }
        });
      }
    }

    if (env.autoBlockIpOnMlExtreme && detection.entityType === "IP" && detection.severity === AbuseSeverity.HIGH) {
      const existing = await prisma.ipRule.findFirst({
        where: {
          type: IpRuleType.BLOCK,
          value: detection.entityId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      });
      if (!existing) {
        const rule = await prisma.ipRule.create({
          data: {
            type: IpRuleType.BLOCK,
            value: detection.entityId,
            reason: "Auto-blocked by ML anomaly detector",
            createdById: env.systemActorUserId,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
          }
        });
        publish({
          type: "IP_RULE_CHANGED",
          payload: { action: "AUTO_BLOCK_ML", ipRuleId: rule.id, type: rule.type, value: rule.value, active: rule.active }
        });
      }
    }
  }
}

async function runDetectors() {
  try {
    await Promise.all([
      detectIpSpike(),
      detectKeySpike(),
      detectErrorRate(),
      detectDomainFlood(),
      detectMultiKeyPerIp(),
      detectDomainKeyFanout(),
      detectBurstAndEnumeration(),
      detectMlAnomalies()
    ]);
  } catch (err) {
    console.error("abuse detector error", err);
  }
}

export function startAbuseDetector() {
  if (timer) return;
  timer = setInterval(() => {
    void runDetectors();
  }, 60_000);
}

export function stopAbuseDetector() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
