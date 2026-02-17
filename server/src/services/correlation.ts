import { prisma } from "../lib/prisma";

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export type CorrelationLogRow = { domain: string | null; ipAddress: string; apiKeyId: string | null; userId?: string | null };

export function deriveDomainCorrelation(domain: string, logs: CorrelationLogRow[]) {
  const normalized = domain.toLowerCase();
  const pivot = logs.filter((l) => (l.domain || "").toLowerCase() === normalized);
  const relatedIps = uniq(pivot.map((l) => l.ipAddress).filter(Boolean));
  const relatedKeys = uniq(pivot.map((l) => l.apiKeyId).filter((v): v is string => Boolean(v)));
  const relatedDomains = uniq(
    logs
      .filter((l) => relatedIps.includes(l.ipAddress) || (l.apiKeyId ? relatedKeys.includes(l.apiKeyId) : false))
      .map((l) => l.domain)
      .filter((d): d is string => typeof d === "string" && d.toLowerCase() !== normalized)
  );
  return { relatedDomains, relatedIps, relatedKeys };
}

export function deriveIpCorrelation(ip: string, logs: CorrelationLogRow[]) {
  const pivot = logs.filter((l) => l.ipAddress === ip);
  const relatedDomains = uniq(pivot.map((l) => l.domain).filter((d): d is string => Boolean(d)));
  const relatedKeys = uniq(pivot.map((l) => l.apiKeyId).filter((k): k is string => Boolean(k)));
  const relatedUsers = uniq(pivot.map((l) => l.userId).filter((u): u is string => Boolean(u)));
  const relatedIps = uniq(
    logs
      .filter((l) => (l.apiKeyId ? relatedKeys.includes(l.apiKeyId) : false) || (l.domain ? relatedDomains.includes(l.domain) : false))
      .map((l) => l.ipAddress)
      .filter((other) => other !== ip)
  );
  return { relatedDomains, relatedKeys, relatedUsers, relatedIps };
}

export async function correlateDomain(domain: string) {
  const normalized = domain.toLowerCase();
  const logs = await prisma.apiRequestLog.findMany({
    where: { domain: normalized },
    select: { ipAddress: true, apiKeyId: true, domain: true, userId: true }
  });
  const relatedLogRows = await prisma.apiRequestLog.findMany({
    where: {
      domain: { not: null }
    },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true },
    take: 5000
  });
  const derived = deriveDomainCorrelation(normalized, [...logs, ...relatedLogRows]);
  const relatedIps = derived.relatedIps;
  const relatedKeys = derived.relatedKeys;
  const relatedDomains = derived.relatedDomains.slice(0, 200);

  const flags = await prisma.abuseFlag.findMany({
    where: {
      OR: [{ ipAddress: { in: relatedIps } }, { apiKeyId: { in: relatedKeys } }, { details: { path: ["domain"], equals: normalized } }]
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return {
    domain: normalized,
    relatedDomains,
    relatedIps,
    relatedKeys,
    flags: flags.map((f) => ({
      id: f.id,
      kind: f.kind,
      severity: f.severity,
      createdAt: f.createdAt
    }))
  };
}

export async function correlateIp(ip: string) {
  const logs = await prisma.apiRequestLog.findMany({
    where: { ipAddress: ip },
    select: { domain: true, apiKeyId: true, userId: true, ipAddress: true },
    take: 5000
  });

  const overlapLogs = await prisma.apiRequestLog.findMany({
    where: {
      domain: { not: null }
    },
    select: { ipAddress: true, domain: true, apiKeyId: true, userId: true },
    take: 5000
  });
  const derived = deriveIpCorrelation(ip, [...logs, ...overlapLogs]);
  const relatedDomains = derived.relatedDomains.slice(0, 200);
  const relatedKeys = derived.relatedKeys;
  const relatedUsers = derived.relatedUsers;
  const relatedIps = derived.relatedIps.slice(0, 200);

  const flags = await prisma.abuseFlag.findMany({
    where: {
      OR: [{ ipAddress: ip }, { apiKeyId: { in: relatedKeys } }]
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return {
    ip,
    relatedDomains,
    relatedIps,
    relatedKeys,
    relatedUsers,
    flags: flags.map((f) => ({
      id: f.id,
      kind: f.kind,
      severity: f.severity,
      createdAt: f.createdAt
    }))
  };
}
