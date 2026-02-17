import { AbuseSeverity, ModerationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

type ReputationRiskLevel = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type ReputationBreakdown = {
  reportsApproved: number;
  reportsRejected: number;
  topCategories: Array<{ category: string; count: number }>;
  impersonationHit: boolean;
  abuseFlags: {
    low: number;
    medium: number;
    high: number;
  };
  historyTrend: "IMPROVING" | "STABLE" | "WORSENING";
  avgRiskScore30d: number;
  latestRiskScore: number | null;
};

type ReputationCounts = {
  feedbackTotal: number;
  approved: number;
  rejected: number;
  pending: number;
};

export type DomainReputationView = {
  domain: string;
  reputationScore: number;
  riskLevel: ReputationRiskLevel;
  confidence: number;
  verifiedOwner: boolean;
  verifiedAt: string | null;
  lastComputedAt: string;
  signals: ReputationBreakdown;
  counts: ReputationCounts;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: DomainReputationView }>();

const categoryWeights: Record<string, number> = {
  phishing: 10,
  impersonation: 12,
  "investment scam": 8,
  investment: 8,
  malware: 15,
  "malware delivery": 15,
  "fake crypto platform": 10,
  "tech support scam": 7,
  "romance scam": 6,
  "marketplace fraud": 7,
  "job scam": 6,
  "clone website": 9,
  smishing: 8,
  "email spoofing": 8,
  "rug pulls": 10,
  "pump & dump": 10,
  "giveaway scams": 9
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function toRiskLevel(score: number, latestRiskScore: number | null): ReputationRiskLevel {
  const merged = latestRiskScore === null ? score : Math.max(score, Math.round(latestRiskScore * 0.9));
  if (merged >= 85) return "CRITICAL";
  if (merged >= 65) return "HIGH";
  if (merged >= 40) return "MEDIUM";
  if (merged >= 20) return "LOW";
  return "SAFE";
}

function categoryWeight(category: string): number {
  const key = category.toLowerCase().trim();
  return categoryWeights[key] ?? 5;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readCache(domain: string): DomainReputationView | null {
  const hit = cache.get(domain);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(domain);
    return null;
  }
  return hit.value;
}

function writeCache(value: DomainReputationView) {
  cache.set(value.domain, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function computeDomainReputation(domainRaw: string): Promise<DomainReputationView> {
  const domain = String(domainRaw).toLowerCase().trim();
  const [existingReputation, feedback, history30d, historyAll, latestHistory, highFlags, mediumFlags, lowFlags, pendingCount] = await Promise.all([
    prisma.domainReputation.findUnique({
      where: { domain },
      select: { verifiedOwner: true, verifiedAt: true }
    }),
    prisma.domainFeedback.findMany({
      where: { domain },
      select: { id: true, category: true, status: true, reputationWeight: true }
    }),
    prisma.domainHistory.findMany({
      where: { domain, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { score: true, createdAt: true, factors: true }
    }),
    prisma.domainHistory.findMany({
      where: { domain },
      orderBy: { createdAt: "asc" },
      select: { score: true, createdAt: true, factors: true }
    }),
    prisma.domainHistory.findFirst({
      where: { domain },
      orderBy: { createdAt: "desc" },
      select: { score: true }
    }),
    prisma.abuseFlag.count({
      where: {
        severity: AbuseSeverity.HIGH,
        details: { path: ["domain"], equals: domain },
        resolvedAt: null
      }
    }),
    prisma.abuseFlag.count({
      where: {
        severity: AbuseSeverity.MEDIUM,
        details: { path: ["domain"], equals: domain },
        resolvedAt: null
      }
    }),
    prisma.abuseFlag.count({
      where: {
        severity: AbuseSeverity.LOW,
        details: { path: ["domain"], equals: domain },
        resolvedAt: null
      }
    }),
    prisma.domainFeedback.count({
      where: { domain, status: ModerationStatus.PENDING }
    })
  ]);

  const approved = feedback.filter((f) => f.status === ModerationStatus.APPROVED);
  const rejected = feedback.filter((f) => f.status === ModerationStatus.REJECTED);
  const wasVerified = Boolean(existingReputation?.verifiedOwner);

  let score = 0;
  for (const item of approved) {
    score += (5 + categoryWeight(item.category)) * Math.max(0.2, Math.min(2, Number(item.reputationWeight || 1)));
  }
  score -= rejected.length * 2;

  const impersonationHit = history30d.some((h) => JSON.stringify(h.factors).toLowerCase().includes("impersonation"));
  if (impersonationHit) score += 40;

  score += highFlags * 15;
  score += mediumFlags * 7;
  score += lowFlags * 3;

  const avgRiskScore30d = Number(avg(history30d.map((h) => h.score)).toFixed(1));
  score += Math.round(avgRiskScore30d * 0.2);

  const first = historyAll[0];
  const last = historyAll[historyAll.length - 1];
  let trend: ReputationBreakdown["historyTrend"] = "STABLE";
  if (first && last) {
    const diff = last.score - first.score;
    if (diff > 15) {
      trend = "WORSENING";
      score += 10;
    } else if (diff < -15) {
      trend = "IMPROVING";
      score -= 6;
    }
  }

  const longStable =
    historyAll.length >= 5 &&
    first &&
    Date.now() - first.createdAt.getTime() > 180 * 24 * 60 * 60 * 1000 &&
    avg(historyAll.map((h) => h.score)) < 20;
  if (longStable && !impersonationHit && highFlags === 0 && approved.length === 0) {
    score -= 10;
  }
  if (wasVerified) {
    score -= 6;
  }

  const clampedScore = clampScore(score);
  const latestRiskScore = latestHistory?.score ?? null;
  const riskLevel = toRiskLevel(clampedScore, latestRiskScore);
  const confidenceRaw =
    0.2 +
    Math.min(0.35, approved.length * 0.03) +
    Math.min(0.2, (highFlags + mediumFlags + lowFlags) * 0.04) +
    (history30d.length > 3 ? 0.12 : history30d.length > 0 ? 0.06 : 0) +
    (impersonationHit ? 0.18 : 0) +
    (wasVerified ? 0.05 : 0);
  const confidence = Number(Math.max(0.15, Math.min(0.99, confidenceRaw)).toFixed(3));

  const topCategoryMap = new Map<string, number>();
  for (const item of approved) {
    topCategoryMap.set(item.category, (topCategoryMap.get(item.category) ?? 0) + 1);
  }
  const topCategories = Array.from(topCategoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const signals: ReputationBreakdown = {
    reportsApproved: approved.length,
    reportsRejected: rejected.length,
    topCategories,
    impersonationHit,
    abuseFlags: { high: highFlags, medium: mediumFlags, low: lowFlags },
    historyTrend: trend,
    avgRiskScore30d,
    latestRiskScore
  };
  if (wasVerified) {
    signals.topCategories = [{ category: "Domain owner verified via DNS", count: 1 }, ...signals.topCategories].slice(0, 5);
  }

  const counts: ReputationCounts = {
    feedbackTotal: feedback.length,
    approved: approved.length,
    rejected: rejected.length,
    pending: pendingCount
  };

  let verifiedOwner = wasVerified;
  let verifiedAt = existingReputation?.verifiedAt ?? null;
  if (riskLevel === "CRITICAL" && verifiedOwner) {
    verifiedOwner = false;
    verifiedAt = null;
    await prisma.domainVerification.updateMany({
      where: {
        domain,
        status: "VERIFIED"
      },
      data: {
        status: "FAILED"
      }
    });
  }

  const saved = await prisma.domainReputation.upsert({
    where: { domain },
    create: {
      domain,
      reputationScore: clampedScore,
      riskLevel,
      confidence,
      lastComputedAt: new Date(),
      signals,
      counts,
      verifiedOwner,
      verifiedAt
    },
    update: {
      reputationScore: clampedScore,
      riskLevel,
      confidence,
      lastComputedAt: new Date(),
      signals,
      counts,
      verifiedOwner,
      verifiedAt
    }
  });

  const view: DomainReputationView = {
    domain: saved.domain,
    reputationScore: saved.reputationScore,
    riskLevel: saved.riskLevel as ReputationRiskLevel,
    confidence: saved.confidence,
    verifiedOwner: saved.verifiedOwner,
    verifiedAt: saved.verifiedAt ? saved.verifiedAt.toISOString() : null,
    lastComputedAt: saved.lastComputedAt.toISOString(),
    signals: saved.signals as unknown as ReputationBreakdown,
    counts: saved.counts as unknown as ReputationCounts
  };
  writeCache(view);
  return view;
}

export async function getDomainReputation(domainRaw: string): Promise<DomainReputationView> {
  const domain = String(domainRaw).toLowerCase().trim();
  const cached = readCache(domain);
  if (cached) return cached;

  const existing = await prisma.domainReputation.findUnique({ where: { domain } });
  if (existing) {
    const view: DomainReputationView = {
      domain: existing.domain,
      reputationScore: existing.reputationScore,
      riskLevel: existing.riskLevel as ReputationRiskLevel,
      confidence: existing.confidence,
      verifiedOwner: existing.verifiedOwner,
      verifiedAt: existing.verifiedAt ? existing.verifiedAt.toISOString() : null,
      lastComputedAt: existing.lastComputedAt.toISOString(),
      signals: existing.signals as unknown as ReputationBreakdown,
      counts: existing.counts as unknown as ReputationCounts
    };
    writeCache(view);
    return view;
  }
  return computeDomainReputation(domain);
}
