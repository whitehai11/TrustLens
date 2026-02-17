import { env } from "../config/env";
import { prisma } from "../lib/prisma";

let timer: NodeJS.Timeout | null = null;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function runRetentionCleanup() {
  try {
    const logCutoff = daysAgo(env.logRetentionDays);
    const intelCutoff = daysAgo(env.intelRetentionDays);

    await Promise.all([
      prisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
      prisma.ipActivity.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
      prisma.adminAuditLog.deleteMany({ where: { createdAt: { lt: logCutoff } } }),
      prisma.abuseFlag.deleteMany({ where: { createdAt: { lt: logCutoff }, resolvedAt: { not: null } } }),
      prisma.domainHistory.deleteMany({ where: { createdAt: { lt: intelCutoff } } })
    ]);
  } catch (err) {
    console.error("retention cleanup error", err);
  }
}

export function startRetentionJob() {
  if (timer) return;
  timer = setInterval(() => {
    void runRetentionCleanup();
  }, 6 * 60 * 60 * 1000);
}

export function stopRetentionJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

