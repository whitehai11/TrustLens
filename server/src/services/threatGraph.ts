import { prisma } from "../lib/prisma";
import { maskApiKeyFromParts, maskEmail } from "../lib/security";

export type GraphNodeType = "DOMAIN" | "IP" | "KEY" | "USER" | "FLAG";
export type GraphEdgeKind = "QUERIED_BY" | "USED_FROM" | "FLAGGED" | "RELATED";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  severity?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  weight?: number;
  createdAt?: string;
};

export type ThreatGraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: Record<string, unknown>;
};

function nodeId(type: GraphNodeType, value: string) {
  return `${type}:${value}`;
}

function pushNode(map: Map<string, GraphNode>, node: GraphNode) {
  if (!map.has(node.id)) map.set(node.id, node);
}

function pushEdge(map: Map<string, GraphEdge>, edge: GraphEdge) {
  const key = `${edge.from}|${edge.to}|${edge.kind}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...edge, weight: edge.weight || 1 });
    return;
  }
  existing.weight = (existing.weight || 1) + (edge.weight || 1);
  if (edge.createdAt && (!existing.createdAt || edge.createdAt > existing.createdAt)) existing.createdAt = edge.createdAt;
}

async function buildGraphFromLogs(logs: Array<{ domain: string | null; ipAddress: string; apiKeyId: string | null; userId: string | null; createdAt: Date }>, scope: Record<string, unknown>) {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  const keyIds = Array.from(new Set(logs.map((l) => l.apiKeyId).filter((k): k is string => Boolean(k))));
  const userIds = Array.from(new Set(logs.map((l) => l.userId).filter((u): u is string => Boolean(u))));
  const domains = Array.from(new Set(logs.map((l) => l.domain).filter((d): d is string => Boolean(d))));
  const ips = Array.from(new Set(logs.map((l) => l.ipAddress).filter(Boolean)));

  const [keys, users] = await Promise.all([
    keyIds.length
      ? prisma.apiKey.findMany({ where: { id: { in: keyIds } }, select: { id: true, prefix: true, last4: true, status: true, userId: true } })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, role: true, status: true } })
      : Promise.resolve([])
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const keyById = new Map(keys.map((k) => [k.id, k]));

  for (const domain of domains) {
    pushNode(nodeMap, { id: nodeId("DOMAIN", domain), type: "DOMAIN", label: domain, meta: {} });
  }
  for (const ip of ips) {
    pushNode(nodeMap, { id: nodeId("IP", ip), type: "IP", label: ip, meta: {} });
  }
  for (const key of keys) {
    pushNode(nodeMap, {
      id: nodeId("KEY", key.id),
      type: "KEY",
      label: maskApiKeyFromParts(key.prefix, key.last4),
      meta: { apiKeyId: key.id, status: key.status }
    });
  }
  for (const user of users) {
    pushNode(nodeMap, {
      id: nodeId("USER", user.id),
      type: "USER",
      label: maskEmail(user.email),
      meta: { userId: user.id, role: user.role, status: user.status }
    });
  }

  for (const log of logs) {
    if (log.domain) {
      pushEdge(edgeMap, {
        from: nodeId("IP", log.ipAddress),
        to: nodeId("DOMAIN", log.domain),
        kind: "RELATED",
        createdAt: log.createdAt.toISOString()
      });
    }
    if (log.apiKeyId) {
      if (log.domain) {
        pushEdge(edgeMap, {
          from: nodeId("KEY", log.apiKeyId),
          to: nodeId("DOMAIN", log.domain),
          kind: "QUERIED_BY",
          createdAt: log.createdAt.toISOString()
        });
      }
      pushEdge(edgeMap, {
        from: nodeId("KEY", log.apiKeyId),
        to: nodeId("IP", log.ipAddress),
        kind: "USED_FROM",
        createdAt: log.createdAt.toISOString()
      });
    }
    if (log.userId && log.apiKeyId) {
      pushEdge(edgeMap, {
        from: nodeId("USER", log.userId),
        to: nodeId("KEY", log.apiKeyId),
        kind: "RELATED",
        createdAt: log.createdAt.toISOString()
      });
    } else if (log.userId && log.domain) {
      pushEdge(edgeMap, {
        from: nodeId("USER", log.userId),
        to: nodeId("DOMAIN", log.domain),
        kind: "RELATED",
        createdAt: log.createdAt.toISOString()
      });
    }
  }

  const candidateFlags = await prisma.abuseFlag.findMany({
    where: {
      OR: [{ ipAddress: { in: ips } }, { apiKeyId: { in: keyIds } }]
    },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  const flags = candidateFlags.filter((flag) => {
    const details = flag.details as { domain?: string };
    return flag.ipAddress !== null || flag.apiKeyId !== null || (details && typeof details.domain === "string" && domains.includes(details.domain));
  });

  for (const flag of flags) {
    const flagNodeId = nodeId("FLAG", flag.id);
    pushNode(nodeMap, {
      id: flagNodeId,
      type: "FLAG",
      label: `${flag.kind}:${flag.severity}`,
      severity: flag.severity,
      createdAt: flag.createdAt.toISOString(),
      meta: { flagId: flag.id, kind: flag.kind, severity: flag.severity }
    });
    if (flag.apiKeyId) {
      pushEdge(edgeMap, { from: flagNodeId, to: nodeId("KEY", flag.apiKeyId), kind: "FLAGGED", createdAt: flag.createdAt.toISOString() });
    }
    if (flag.ipAddress) {
      pushEdge(edgeMap, { from: flagNodeId, to: nodeId("IP", flag.ipAddress), kind: "FLAGGED", createdAt: flag.createdAt.toISOString() });
    }
    const details = flag.details as { domain?: string };
    if (details && typeof details.domain === "string") {
      pushNode(nodeMap, { id: nodeId("DOMAIN", details.domain), type: "DOMAIN", label: details.domain });
      pushEdge(edgeMap, { from: flagNodeId, to: nodeId("DOMAIN", details.domain), kind: "FLAGGED", createdAt: flag.createdAt.toISOString() });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    summary: {
      ...scope,
      nodeCount: nodeMap.size,
      edgeCount: edgeMap.size,
      keyCount: keyIds.length,
      ipCount: ips.length,
      domainCount: domains.length,
      userCount: users.length,
      flagCount: flags.length
    }
  } satisfies ThreatGraphResponse;
}

export async function threatGraphByDomain(domain: string) {
  const normalized = domain.toLowerCase();
  const pivot = await prisma.apiRequestLog.findMany({
    where: { domain: normalized },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 3000
  });
  const ips = Array.from(new Set(pivot.map((p) => p.ipAddress)));
  const keys = Array.from(new Set(pivot.map((p) => p.apiKeyId).filter((k): k is string => Boolean(k))));
  const related = await prisma.apiRequestLog.findMany({
    where: {
      OR: [{ ipAddress: { in: ips.length ? ips : [""] } }, { apiKeyId: { in: keys.length ? keys : [""] } }]
    },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 5000
  });
  return buildGraphFromLogs([...pivot, ...related], { focusType: "DOMAIN", focusId: normalized });
}

export async function threatGraphByIp(ip: string) {
  const pivot = await prisma.apiRequestLog.findMany({
    where: { ipAddress: ip },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 3000
  });
  const domains = Array.from(new Set(pivot.map((p) => p.domain).filter((d): d is string => Boolean(d))));
  const keys = Array.from(new Set(pivot.map((p) => p.apiKeyId).filter((k): k is string => Boolean(k))));
  const related = await prisma.apiRequestLog.findMany({
    where: {
      OR: [{ domain: { in: domains.length ? domains : [""] } }, { apiKeyId: { in: keys.length ? keys : [""] } }]
    },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 5000
  });
  return buildGraphFromLogs([...pivot, ...related], { focusType: "IP", focusId: ip });
}

export async function threatGraphByKey(keyId: string) {
  const pivot = await prisma.apiRequestLog.findMany({
    where: { apiKeyId: keyId },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 3000
  });
  const domains = Array.from(new Set(pivot.map((p) => p.domain).filter((d): d is string => Boolean(d))));
  const ips = Array.from(new Set(pivot.map((p) => p.ipAddress)));
  const related = await prisma.apiRequestLog.findMany({
    where: {
      OR: [{ domain: { in: domains.length ? domains : [""] } }, { ipAddress: { in: ips.length ? ips : [""] } }]
    },
    select: { domain: true, ipAddress: true, apiKeyId: true, userId: true, createdAt: true },
    take: 5000
  });
  return buildGraphFromLogs([...pivot, ...related], { focusType: "KEY", focusId: keyId });
}
