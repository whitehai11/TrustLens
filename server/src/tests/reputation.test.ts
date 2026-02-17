import test from "node:test";
import assert from "node:assert/strict";
import { computeDomainReputation } from "../services/reputation";
import { prisma } from "../lib/prisma";

test("computeDomainReputation escalates with impersonation + approved feedback + abuse", async () => {
  const original = {
    reputationFindUnique: prisma.domainReputation.findUnique,
    feedbackFindMany: prisma.domainFeedback.findMany,
    feedbackCount: prisma.domainFeedback.count,
    historyFindMany: prisma.domainHistory.findMany,
    historyFindFirst: prisma.domainHistory.findFirst,
    abuseCount: prisma.abuseFlag.count,
    reputationUpsert: prisma.domainReputation.upsert
  };

  try {
    (prisma.domainReputation.findUnique as unknown as () => Promise<unknown>) = async () => ({ verifiedOwner: false, verifiedAt: null });
    (prisma.domainFeedback.findMany as unknown as (args: Record<string, unknown>) => Promise<unknown>) = async () => [
      { id: "f1", category: "impersonation", status: "APPROVED" },
      { id: "f2", category: "malware", status: "APPROVED" },
      { id: "f3", category: "phishing", status: "REJECTED" }
    ];
    (prisma.domainFeedback.count as unknown as (args: Record<string, unknown>) => Promise<number>) = async () => 1;

    (prisma.domainHistory.findMany as unknown as (args: { where?: { createdAt?: unknown } }) => Promise<unknown>) = async (args) => {
      if (args?.where?.createdAt) {
        return [
          { score: 68, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] },
          { score: 75, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] },
          { score: 82, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] }
        ];
      }
      return [
        { score: 35, createdAt: new Date(Date.now() - 240 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 82, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] }
      ];
    };
    (prisma.domainHistory.findFirst as unknown as () => Promise<unknown>) = async () => ({ score: 82 });

    (prisma.abuseFlag.count as unknown as (args: { where: { severity: string } }) => Promise<number>) = async (args) => {
      if (args.where.severity === "HIGH") return 2;
      if (args.where.severity === "MEDIUM") return 1;
      return 0;
    };

    (prisma.domainReputation.upsert as unknown as (args: { create: Record<string, unknown> }) => Promise<unknown>) = async (args) => ({
      ...args.create
    });

    const out = await computeDomainReputation("rnicrosoft.com");
    assert.equal(out.riskLevel === "HIGH" || out.riskLevel === "CRITICAL", true);
    assert.equal(out.reputationScore >= 70, true);
    assert.equal(out.signals.impersonationHit, true);
    assert.equal(out.counts.approved, 2);
  } finally {
    prisma.domainReputation.findUnique = original.reputationFindUnique;
    prisma.domainFeedback.findMany = original.feedbackFindMany;
    prisma.domainFeedback.count = original.feedbackCount;
    prisma.domainHistory.findMany = original.historyFindMany;
    prisma.domainHistory.findFirst = original.historyFindFirst;
    prisma.abuseFlag.count = original.abuseCount;
    prisma.domainReputation.upsert = original.reputationUpsert;
  }
});

test("computeDomainReputation stays low for stable clean domain", async () => {
  const original = {
    reputationFindUnique: prisma.domainReputation.findUnique,
    feedbackFindMany: prisma.domainFeedback.findMany,
    feedbackCount: prisma.domainFeedback.count,
    historyFindMany: prisma.domainHistory.findMany,
    historyFindFirst: prisma.domainHistory.findFirst,
    abuseCount: prisma.abuseFlag.count,
    reputationUpsert: prisma.domainReputation.upsert
  };

  try {
    (prisma.domainReputation.findUnique as unknown as () => Promise<unknown>) = async () => ({ verifiedOwner: true, verifiedAt: new Date() });
    (prisma.domainFeedback.findMany as unknown as () => Promise<unknown>) = async () => [];
    (prisma.domainFeedback.count as unknown as () => Promise<number>) = async () => 0;
    (prisma.domainHistory.findMany as unknown as (args: { where?: { createdAt?: unknown } }) => Promise<unknown>) = async (args) => {
      if (args?.where?.createdAt) {
        return [
          { score: 8, createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), factors: [] },
          { score: 7, createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), factors: [] },
          { score: 5, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: [] }
        ];
      }
      return [
        { score: 10, createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 9, createdAt: new Date(Date.now() - 250 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 7, createdAt: new Date(Date.now() - 140 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 6, createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 5, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: [] }
      ];
    };
    (prisma.domainHistory.findFirst as unknown as () => Promise<unknown>) = async () => ({ score: 5 });
    (prisma.abuseFlag.count as unknown as () => Promise<number>) = async () => 0;
    (prisma.domainReputation.upsert as unknown as (args: { create: Record<string, unknown> }) => Promise<unknown>) = async (args) => ({
      ...args.create
    });

    const out = await computeDomainReputation("github.com");
    assert.equal(out.riskLevel === "SAFE" || out.riskLevel === "LOW", true);
    assert.equal(out.reputationScore <= 20, true);
    assert.equal(out.signals.impersonationHit, false);
  } finally {
    prisma.domainReputation.findUnique = original.reputationFindUnique;
    prisma.domainFeedback.findMany = original.feedbackFindMany;
    prisma.domainFeedback.count = original.feedbackCount;
    prisma.domainHistory.findMany = original.historyFindMany;
    prisma.domainHistory.findFirst = original.historyFindFirst;
    prisma.abuseFlag.count = original.abuseCount;
    prisma.domainReputation.upsert = original.reputationUpsert;
  }
});

test("verified owner does not force low risk when impersonation/high signals exist", async () => {
  const original = {
    reputationFindUnique: prisma.domainReputation.findUnique,
    feedbackFindMany: prisma.domainFeedback.findMany,
    feedbackCount: prisma.domainFeedback.count,
    historyFindMany: prisma.domainHistory.findMany,
    historyFindFirst: prisma.domainHistory.findFirst,
    abuseCount: prisma.abuseFlag.count,
    verificationUpdateMany: prisma.domainVerification.updateMany,
    reputationUpsert: prisma.domainReputation.upsert
  };

  try {
    (prisma.domainReputation.findUnique as unknown as () => Promise<unknown>) = async () => ({ verifiedOwner: true, verifiedAt: new Date() });
    (prisma.domainFeedback.findMany as unknown as () => Promise<unknown>) = async () => [
      { id: "f1", category: "impersonation", status: "APPROVED" }
    ];
    (prisma.domainFeedback.count as unknown as () => Promise<number>) = async () => 0;
    (prisma.domainHistory.findMany as unknown as (args: { where?: { createdAt?: unknown } }) => Promise<unknown>) = async (args) => {
      if (args?.where?.createdAt) {
        return [
          { score: 88, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] },
          { score: 91, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] }
        ];
      }
      return [
        { score: 70, createdAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000), factors: [] },
        { score: 91, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), factors: ["Brand impersonation detected"] }
      ];
    };
    (prisma.domainHistory.findFirst as unknown as () => Promise<unknown>) = async () => ({ score: 91 });
    (prisma.abuseFlag.count as unknown as (args: { where: { severity: string } }) => Promise<number>) = async (args) =>
      args.where.severity === "HIGH" ? 2 : 0;
    (prisma.domainVerification.updateMany as unknown as () => Promise<unknown>) = async () => ({ count: 1 });
    (prisma.domainReputation.upsert as unknown as (args: { create: Record<string, unknown> }) => Promise<unknown>) = async (args) => ({
      ...args.create
    });

    const out = await computeDomainReputation("rnicrosoft.com");
    assert.equal(["HIGH", "CRITICAL"].includes(out.riskLevel), true);
  } finally {
    prisma.domainReputation.findUnique = original.reputationFindUnique;
    prisma.domainFeedback.findMany = original.feedbackFindMany;
    prisma.domainFeedback.count = original.feedbackCount;
    prisma.domainHistory.findMany = original.historyFindMany;
    prisma.domainHistory.findFirst = original.historyFindFirst;
    prisma.abuseFlag.count = original.abuseCount;
    prisma.domainVerification.updateMany = original.verificationUpdateMany;
    prisma.domainReputation.upsert = original.reputationUpsert;
  }
});
