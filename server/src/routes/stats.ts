import { Router } from "express";
import { prisma } from "../lib/prisma";
import { getTldRiskStats, getTldRiskStatsForWindow } from "../services/tldStats";

const router = Router();

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

router.get("/", async (_req, res) => {
  const [reports24h, reports7d, reports30d, reports1y, totalDomainsChecked] = await Promise.all([
    prisma.domainReport.count({ where: { createdAt: { gte: daysAgo(1) } } }),
    prisma.domainReport.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.domainReport.count({ where: { createdAt: { gte: daysAgo(30) } } }),
    prisma.domainReport.count({ where: { createdAt: { gte: daysAgo(365) } } }),
    prisma.domainCheck.count()
  ]);

  return res.json({
    reports_24h: reports24h,
    reports_7d: reports7d,
    reports_30d: reports30d,
    reports_1y: reports1y,
    total_domains_checked: totalDomainsChecked
  });
});

router.get("/tld", async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : undefined;
  const rows = days ? await getTldRiskStatsForWindow(days, 300) : await getTldRiskStats(300);
  return res.json({
    note: "TLD statistics are based solely on TrustLens internal observations and do not represent authoritative global data.",
    rows
  });
});

router.get("/transparency", async (_req, res) => {
  const [totalDomainsAnalyzed, totalReportsSubmitted, reportsApproved, reportsRejected, verifiedDomainsCount, openDisputes, abuseFlagsGenerated, averageRiskScore, tlds] =
    await Promise.all([
      prisma.domainCheck.count(),
      prisma.domainFeedback.count(),
      prisma.domainFeedback.count({ where: { status: "APPROVED" } }),
      prisma.domainFeedback.count({ where: { status: "REJECTED" } }),
      prisma.domainReputation.count({ where: { verifiedOwner: true } }),
      prisma.domainDispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.abuseFlag.count(),
      prisma.domainCheck.aggregate({ _avg: { score: true } }),
      getTldRiskStats(10)
    ]);

  return res.json({
    total_domains_analyzed: totalDomainsAnalyzed,
    total_reports_submitted: totalReportsSubmitted,
    reports_approved: reportsApproved,
    reports_rejected: reportsRejected,
    verified_domains_count: verifiedDomainsCount,
    open_disputes: openDisputes,
    abuse_flags_generated: abuseFlagsGenerated,
    average_risk_score: Number((averageRiskScore._avg.score || 0).toFixed(2)),
    top_tld_risk_ratios: tlds.slice(0, 10),
    note: "TLD statistics are based solely on TrustLens internal observations and do not represent authoritative global data."
  });
});

export default router;
