import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

function extractTld(domain: string): string {
  const parts = String(domain || "").toLowerCase().split(".").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "unknown";
}

export async function recordTldObservation(input: { domain: string; riskLevel: string }) {
  const tld = extractTld(input.domain);
  await prisma.tldStats.upsert({
    where: { tld },
    create: {
      tld,
      totalDomains: 1,
      highRiskCount: input.riskLevel === "HIGH" ? 1 : 0,
      criticalCount: input.riskLevel === "CRITICAL" ? 1 : 0
    },
    update: {
      totalDomains: { increment: 1 },
      highRiskCount: { increment: input.riskLevel === "HIGH" ? 1 : 0 },
      criticalCount: { increment: input.riskLevel === "CRITICAL" ? 1 : 0 }
    }
  });
}

export async function getTldRiskStats(limit = 100) {
  const rows = await prisma.tldStats.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit
  });
  return rows
    .map((row) => ({
      ...row,
      tldRiskRatio: row.totalDomains > 0 ? Number(((row.highRiskCount + row.criticalCount) / row.totalDomains).toFixed(4)) : 0
    }))
    .sort((a, b) => b.tldRiskRatio - a.tldRiskRatio);
}

export async function getTldRiskStatsForWindow(days: number, limit = 100) {
  const daysSafe = Number.isFinite(days) && days > 0 ? Math.min(days, 3650) : 30;
  const rows = await prisma.$queryRaw<
    Array<{ tld: string; totalDomains: bigint; highRiskCount: bigint; criticalCount: bigint }>
  >(Prisma.sql`
    SELECT
      lower(split_part(domain, '.', array_length(regexp_split_to_array(domain, '\.'), 1))) AS tld,
      COUNT(*)::bigint AS "totalDomains",
      COUNT(*) FILTER (WHERE "riskLevel" = 'HIGH')::bigint AS "highRiskCount",
      COUNT(*) FILTER (WHERE "riskLevel" = 'CRITICAL')::bigint AS "criticalCount"
    FROM "DomainCheck"
    WHERE "timestamp" >= NOW() - (${daysSafe} || ' days')::interval
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT ${limit}
  `);
  return rows
    .map((row) => {
      const totalDomains = Number(row.totalDomains);
      const highRiskCount = Number(row.highRiskCount);
      const criticalCount = Number(row.criticalCount);
      return {
        tld: row.tld || "unknown",
        totalDomains,
        highRiskCount,
        criticalCount,
        tldRiskRatio: totalDomains > 0 ? Number(((highRiskCount + criticalCount) / totalDomains).toFixed(4)) : 0
      };
    })
    .sort((a, b) => b.tldRiskRatio - a.tldRiskRatio);
}

export async function recalculateStoredTldStatsFromDomainChecks() {
  const rows = await prisma.$queryRaw<
    Array<{ tld: string; totalDomains: bigint; highRiskCount: bigint; criticalCount: bigint }>
  >(Prisma.sql`
    SELECT
      lower(split_part(domain, '.', array_length(regexp_split_to_array(domain, '\.'), 1))) AS tld,
      COUNT(*)::bigint AS "totalDomains",
      COUNT(*) FILTER (WHERE "riskLevel" = 'HIGH')::bigint AS "highRiskCount",
      COUNT(*) FILTER (WHERE "riskLevel" = 'CRITICAL')::bigint AS "criticalCount"
    FROM "DomainCheck"
    GROUP BY 1
  `);

  await prisma.$transaction(async (tx) => {
    await tx.tldStats.deleteMany({});
    for (const row of rows) {
      await tx.tldStats.create({
        data: {
          tld: row.tld || "unknown",
          totalDomains: Number(row.totalDomains),
          highRiskCount: Number(row.highRiskCount),
          criticalCount: Number(row.criticalCount)
        }
      });
    }
  });

  return getTldRiskStats(500);
}
