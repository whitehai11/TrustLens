import { ApiKeyStatus, ModerationStatus, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

type MetricPoint = {
  ts: number;
  ip: string;
  domain?: string;
  statusCode: number;
};

const window5mMs = 5 * 60 * 1000;
const window1mMs = 60 * 1000;
const points: MetricPoint[] = [];

function prune(now = Date.now()) {
  while (points.length && now - points[0].ts > window5mMs) {
    points.shift();
  }
}

export function recordRequestMetric(input: { ipAddress: string; domain?: string | null; statusCode: number }) {
  const now = Date.now();
  points.push({
    ts: now,
    ip: input.ipAddress,
    domain: input.domain || undefined,
    statusCode: input.statusCode
  });
  prune(now);
}

function topBy(values: string[]) {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  let winner = "";
  let max = 0;
  counts.forEach((count, key) => {
    if (count > max) {
      winner = key;
      max = count;
    }
  });
  return { value: winner, count: max };
}

export async function getRealtimeSnapshot() {
  const now = Date.now();
  prune(now);

  let requestsLast1m = 0;
  let requestsLast5m = 0;
  let errorsLast5m = 0;
  const ipList: string[] = [];
  const domainList: string[] = [];

  for (const point of points) {
    if (now - point.ts <= window5mMs) {
      requestsLast5m += 1;
      ipList.push(point.ip);
      if (point.domain) domainList.push(point.domain);
      if (point.statusCode >= 400) errorsLast5m += 1;
    }
    if (now - point.ts <= window1mMs) {
      requestsLast1m += 1;
    }
  }

  const [openTickets, pendingReports, activeKeys, suspendedKeys] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } } }),
    prisma.domainReport.count({ where: { moderationStatus: ModerationStatus.PENDING } }),
    prisma.apiKey.count({ where: { status: ApiKeyStatus.ACTIVE } }),
    prisma.apiKey.count({ where: { status: ApiKeyStatus.SUSPENDED } })
  ]);

  return {
    requests_last_1m: requestsLast1m,
    requests_last_5m: requestsLast5m,
    errors_last_5m: errorsLast5m,
    open_tickets: openTickets,
    pending_reports: pendingReports,
    active_keys: activeKeys,
    suspended_keys: suspendedKeys,
    top_ip_last_5m: topBy(ipList),
    top_domain_last_5m: topBy(domainList)
  };
}

