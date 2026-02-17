import { prisma } from "../lib/prisma";
import { correlateDomain, correlateIp } from "./correlation";

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function exportDomainIntel(domain: string) {
  const normalized = domain.toLowerCase();
  const [logs, history, flags, incidentLinks, correlation] = await Promise.all([
    prisma.apiRequestLog.findMany({ where: { domain: normalized }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.domainHistory.findMany({ where: { domain: normalized }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.abuseFlag.findMany({
      where: {
        OR: [{ details: { path: ["domain"], equals: normalized } }, { ipAddress: { in: (await prisma.apiRequestLog.findMany({ where: { domain: normalized }, select: { ipAddress: true }, take: 2000 })).map((r) => r.ipAddress) } }]
      },
      orderBy: { createdAt: "desc" },
      take: 2000
    }),
    prisma.incidentLink.findMany({ where: { type: "DOMAIN", targetId: normalized }, include: { incident: true } }),
    correlateDomain(normalized)
  ]);
  return { scope: { domain: normalized }, logs, history, flags, incidentLinks, correlation };
}

export async function exportIpIntel(ip: string) {
  const [logs, activity, flags, incidentLinks, correlation] = await Promise.all([
    prisma.apiRequestLog.findMany({ where: { ipAddress: ip }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.ipActivity.findMany({ where: { ipAddress: ip }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.abuseFlag.findMany({ where: { ipAddress: ip }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.incidentLink.findMany({ where: { type: "IP", targetId: ip }, include: { incident: true } }),
    correlateIp(ip)
  ]);
  return { scope: { ip }, logs, activity, flags, incidentLinks, correlation };
}

export async function exportKeyIntel(keyId: string) {
  const [logs, activity, flags, incidentLinks] = await Promise.all([
    prisma.apiRequestLog.findMany({ where: { apiKeyId: keyId }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.ipActivity.findMany({ where: { apiKeyId: keyId }, orderBy: { createdAt: "desc" }, take: 10000 }),
    prisma.abuseFlag.findMany({ where: { apiKeyId: keyId }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.incidentLink.findMany({ where: { type: "API_KEY", targetId: keyId }, include: { incident: true } })
  ]);
  return { scope: { keyId }, logs, activity, flags, incidentLinks };
}

export function serializeExport(payload: unknown, format: "json" | "csv") {
  if (format === "json") return { contentType: "application/json", body: JSON.stringify(payload, null, 2) };
  if (typeof payload !== "object" || payload === null) return { contentType: "text/csv", body: "" };
  const obj = payload as Record<string, unknown>;
  const rows: Array<Record<string, unknown>> = [];
  for (const [section, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === "object") rows.push({ section, ...(item as Record<string, unknown>) });
    }
  }
  return { contentType: "text/csv", body: toCsv(rows) };
}

