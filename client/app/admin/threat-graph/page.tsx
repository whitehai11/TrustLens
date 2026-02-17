"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RealtimeEvent, useSSE } from "../../../lib/realtime/useSSE";

const API_BASE = "http://localhost:4000/api";
const MAX_NODES = 500;

type NodeType = "DOMAIN" | "IP" | "KEY" | "USER" | "FLAG";
type EdgeKind = "QUERIED_BY" | "USED_FROM" | "FLAGGED" | "RELATED";

type GraphNode = {
  id: string;
  type: NodeType;
  label: string;
  severity?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

type GraphEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
  weight?: number;
  createdAt?: string;
};

type ThreatGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: Record<string, unknown>;
};

type TimeWindowKey = "15m" | "1h" | "24h";

function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("trustlens_token") || "";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return (await res.json()) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function typeColor(type: NodeType) {
  if (type === "DOMAIN") return "#1f2937";
  if (type === "IP") return "#2563eb";
  if (type === "KEY") return "#059669";
  if (type === "USER") return "#7c3aed";
  return "#dc2626";
}

function parseWindowMs(key: TimeWindowKey) {
  if (key === "15m") return 15 * 60 * 1000;
  if (key === "1h") return 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function mergeGraph(base: ThreatGraph, incoming: ThreatGraph) {
  const nodeMap = new Map(base.nodes.map((n) => [n.id, n]));
  for (const node of incoming.nodes) {
    const prev = nodeMap.get(node.id);
    nodeMap.set(node.id, prev ? { ...prev, ...node, meta: { ...(prev.meta || {}), ...(node.meta || {}) } } : node);
  }

  const edgeMap = new Map(base.edges.map((e) => [`${e.from}|${e.to}|${e.kind}`, e]));
  for (const edge of incoming.edges) {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    const prev = edgeMap.get(key);
    edgeMap.set(
      key,
      prev
        ? { ...prev, weight: (prev.weight || 1) + (edge.weight || 1), createdAt: edge.createdAt || prev.createdAt }
        : { ...edge, weight: edge.weight || 1 }
    );
  }

  return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()), summary: { ...base.summary, ...incoming.summary } };
}

function applyLiveEvent(base: ThreatGraph, event: RealtimeEvent): ThreatGraph {
  const nodeMap = new Map(base.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(base.edges.map((e) => [`${e.from}|${e.to}|${e.kind}`, e]));
  const touchNode = (node: GraphNode) => {
    const prev = nodeMap.get(node.id);
    nodeMap.set(node.id, prev ? { ...prev, ...node, meta: { ...(prev.meta || {}), ...(node.meta || {}) } } : node);
  };
  const touchEdge = (edge: GraphEdge) => {
    const key = `${edge.from}|${edge.to}|${edge.kind}`;
    const prev = edgeMap.get(key);
    edgeMap.set(key, prev ? { ...prev, weight: (prev.weight || 1) + (edge.weight || 1), createdAt: edge.createdAt || prev.createdAt } : { ...edge, weight: edge.weight || 1 });
  };

  if (event.type === "LOG_CREATED") {
    const p = event.payload as {
      domain?: string | null;
      ipAddress: string;
      apiKeyId?: string | null;
      userId?: string | null;
      maskedKey?: string | null;
      maskedUser?: string | null;
      riskLevel?: string | null;
    };
    touchNode({ id: `IP:${p.ipAddress}`, type: "IP", label: p.ipAddress, createdAt: event.createdAt });
    if (p.domain) touchNode({ id: `DOMAIN:${p.domain}`, type: "DOMAIN", label: p.domain, createdAt: event.createdAt });
    if (p.apiKeyId) {
      touchNode({ id: `KEY:${p.apiKeyId}`, type: "KEY", label: p.maskedKey || p.apiKeyId, createdAt: event.createdAt, meta: { apiKeyId: p.apiKeyId } });
      touchEdge({ from: `KEY:${p.apiKeyId}`, to: `IP:${p.ipAddress}`, kind: "USED_FROM", createdAt: event.createdAt });
      if (p.domain) touchEdge({ from: `KEY:${p.apiKeyId}`, to: `DOMAIN:${p.domain}`, kind: "QUERIED_BY", createdAt: event.createdAt });
    }
    if (p.userId) {
      touchNode({ id: `USER:${p.userId}`, type: "USER", label: p.maskedUser || p.userId, createdAt: event.createdAt, meta: { userId: p.userId } });
      if (p.apiKeyId) touchEdge({ from: `USER:${p.userId}`, to: `KEY:${p.apiKeyId}`, kind: "RELATED", createdAt: event.createdAt });
      else if (p.domain) touchEdge({ from: `USER:${p.userId}`, to: `DOMAIN:${p.domain}`, kind: "RELATED", createdAt: event.createdAt });
    }
    if (p.domain) touchEdge({ from: `IP:${p.ipAddress}`, to: `DOMAIN:${p.domain}`, kind: "RELATED", createdAt: event.createdAt });
  }

  if (event.type === "ABUSE_FLAG_CREATED") {
    const p = event.payload as { flagId: string; kind: string; severity: string; ipAddress?: string | null; apiKeyId?: string | null; domain?: string | null };
    const flagId = `FLAG:${p.flagId}`;
    touchNode({ id: flagId, type: "FLAG", label: `${p.kind}:${p.severity}`, severity: p.severity, createdAt: event.createdAt, meta: { flagId: p.flagId } });
    if (p.ipAddress) touchEdge({ from: flagId, to: `IP:${p.ipAddress}`, kind: "FLAGGED", createdAt: event.createdAt });
    if (p.apiKeyId) touchEdge({ from: flagId, to: `KEY:${p.apiKeyId}`, kind: "FLAGGED", createdAt: event.createdAt });
    if (p.domain) {
      touchNode({ id: `DOMAIN:${p.domain}`, type: "DOMAIN", label: p.domain, createdAt: event.createdAt });
      touchEdge({ from: flagId, to: `DOMAIN:${p.domain}`, kind: "FLAGGED", createdAt: event.createdAt });
    }
  }

  if (event.type === "KEY_STATUS_CHANGED") {
    const p = event.payload as { apiKeyId?: string; maskedKey?: string; status?: string };
    if (p.apiKeyId) {
      touchNode({ id: `KEY:${p.apiKeyId}`, type: "KEY", label: p.maskedKey || p.apiKeyId, createdAt: event.createdAt, meta: { apiKeyId: p.apiKeyId, status: p.status } });
    }
  }

  if (event.type === "INCIDENT_CHANGED") {
    const p = event.payload as { incidentId: string; status?: string; severity?: string; action?: string; linkType?: string; targetId?: string };
    const incidentNode = `FLAG:INCIDENT-${p.incidentId}`;
    touchNode({
      id: incidentNode,
      type: "FLAG",
      label: `INCIDENT:${p.status || p.action || "UPDATE"}`,
      severity: p.severity || "HIGH",
      createdAt: event.createdAt,
      meta: { incidentId: p.incidentId, status: p.status, action: p.action }
    });
    if (p.linkType && p.targetId) {
      let target = p.targetId;
      if (p.linkType === "IP") target = `IP:${p.targetId}`;
      if (p.linkType === "DOMAIN") target = `DOMAIN:${p.targetId}`;
      if (p.linkType === "API_KEY") target = `KEY:${p.targetId}`;
      if (p.linkType === "USER") target = `USER:${p.targetId}`;
      if (p.linkType === "ABUSE_FLAG") target = `FLAG:${p.targetId}`;
      touchEdge({ from: incidentNode, to: target, kind: "FLAGGED", createdAt: event.createdAt });
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()), summary: base.summary };
}

export default function ThreatGraphPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [graph, setGraph] = useState<ThreatGraph>({ nodes: [], edges: [], summary: {} });
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<"domain" | "ip" | "key">("domain");
  const [live, setLive] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>("1h");
  const [nodeFilter, setNodeFilter] = useState<Record<NodeType, boolean>>({
    DOMAIN: true,
    IP: true,
    KEY: true,
    USER: true,
    FLAG: true
  });
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("ALL");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [logsForSelected, setLogsForSelected] = useState<Array<{ id: string; endpoint: string; statusCode: number; createdAt: string }>>([]);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const filteredGraph = useMemo(() => {
    const minTs = Date.now() - parseWindowMs(timeWindow);
    const nodes = graph.nodes.filter((n) => {
      if (!nodeFilter[n.type]) return false;
      if (severityFilter !== "ALL" && (n.severity || "").toUpperCase() !== severityFilter) return false;
      if (!n.createdAt) return true;
      return new Date(n.createdAt).getTime() >= minTs;
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
    return { nodes, edges };
  }, [graph, nodeFilter, severityFilter, timeWindow]);

  const selectedNode = useMemo(() => filteredGraph.nodes.find((n) => n.id === selectedNodeId) || null, [filteredGraph.nodes, selectedNodeId]);

  const loadGraph = useCallback(async () => {
    const safeQuery = query.trim();
    if (!safeQuery) return;
    const incoming = await api<ThreatGraph>(`/admin/intel/${queryType}/${encodeURIComponent(safeQuery)}`);
    setGraph((prev) => {
      const merged = mergeGraph(prev, incoming);
      const sortedNodes = merged.nodes.sort((a, b) => (new Date(b.createdAt || nowIso()).getTime() - new Date(a.createdAt || nowIso()).getTime())).slice(0, MAX_NODES);
      const keep = new Set(sortedNodes.map((n) => n.id));
      return { nodes: sortedNodes, edges: merged.edges.filter((e) => keep.has(e.from) && keep.has(e.to)), summary: merged.summary };
    });
  }, [query, queryType]);

  const refreshLogsForSelected = useCallback(async () => {
    if (!selectedNode) return;
    let path = "/admin/logs";
    if (selectedNode.type === "IP") path += `?ipAddress=${encodeURIComponent(selectedNode.label)}`;
    if (selectedNode.type === "DOMAIN") path += `?domain=${encodeURIComponent(selectedNode.label)}`;
    if (selectedNode.type === "KEY") path += `?apiKeyId=${encodeURIComponent((selectedNode.meta?.apiKeyId as string) || selectedNode.id.replace("KEY:", ""))}`;
    const rows = await api<Array<{ id: string; endpoint: string; statusCode: number; createdAt: string }>>(path);
    setLogsForSelected(rows.slice(0, 20));
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode) return;
    void refreshLogsForSelected();
  }, [selectedNode, refreshLogsForSelected]);

  const handlers = useMemo(
    () => ({
      onEvent: (event: RealtimeEvent) => {
        if (!live) return;
        setGraph((prev) => {
          const next = applyLiveEvent(prev, event);
          const sortedNodes = next.nodes
            .sort((a, b) => new Date(b.createdAt || nowIso()).getTime() - new Date(a.createdAt || nowIso()).getTime())
            .slice(0, MAX_NODES);
          const keep = new Set(sortedNodes.map((n) => n.id));
          return { ...next, nodes: sortedNodes, edges: next.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
        });
      }
    }),
    [live]
  );

  useSSE(`${API_BASE}/admin/realtime/stream`, handlers);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const margin = 30;
      filteredGraph.nodes.forEach((node, idx) => {
        if (!positionsRef.current.has(node.id)) {
          const x = margin + ((idx * 73) % Math.max(120, rect.width - margin * 2));
          const y = margin + (((idx * 97) % Math.max(120, rect.height - margin * 2)));
          positionsRef.current.set(node.id, { x, y });
        }
      });

      for (const edge of filteredGraph.edges) {
        const from = positionsRef.current.get(edge.from);
        const to = positionsRef.current.get(edge.to);
        if (!from || !to) continue;
        ctx.strokeStyle = "rgba(71,85,105,0.35)";
        ctx.lineWidth = Math.min(6, 1 + (edge.weight || 1) * 0.4);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      for (const node of filteredGraph.nodes) {
        const pos = positionsRef.current.get(node.id);
        if (!pos) continue;
        const radius = node.id === hoverNodeId || node.id === selectedNodeId ? 9 : 6;
        ctx.fillStyle = typeColor(node.type);
        ctx.globalAlpha = 0.93;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0f172a";
        ctx.font = "11px ui-sans-serif, system-ui, -apple-system";
        ctx.fillText(node.label.slice(0, 32), pos.x + 10, pos.y + 4);
      }
    };

    const schedule = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    schedule();
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [filteredGraph, hoverNodeId, selectedNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hitTest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let hit: string | null = null;
      for (const node of filteredGraph.nodes) {
        const pos = positionsRef.current.get(node.id);
        if (!pos) continue;
        const dx = pos.x - x;
        const dy = pos.y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= 12) {
          hit = node.id;
          break;
        }
      }
      return hit;
    };
    const onMove = (ev: MouseEvent) => setHoverNodeId(hitTest(ev.clientX, ev.clientY));
    const onClick = (ev: MouseEvent) => setSelectedNodeId(hitTest(ev.clientX, ev.clientY));
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [filteredGraph.nodes]);

  const quickBlockIp = async () => {
    if (!selectedNode || selectedNode.type !== "IP") return;
    await api("/admin/ip-rules", {
      method: "POST",
      body: JSON.stringify({ type: "BLOCK", value: selectedNode.label, reason: "Threat graph quick action" })
    });
  };

  const quickSuspendKey = async () => {
    if (!selectedNode || selectedNode.type !== "KEY") return;
    const keyId = (selectedNode.meta?.apiKeyId as string) || selectedNode.id.replace("KEY:", "");
    await api(`/admin/keys/${encodeURIComponent(keyId)}/status`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) });
  };

  const quickCreateIncident = async () => {
    if (!selectedNode) return;
    const incident = await api<{ id: string }>("/admin/incidents", {
      method: "POST",
      body: JSON.stringify({
        title: `Threat graph investigation: ${selectedNode.label}`,
        severity: selectedNode.severity || "HIGH",
        status: "OPEN"
      })
    });

    const linkType =
      selectedNode.type === "DOMAIN" ? "DOMAIN" :
      selectedNode.type === "IP" ? "IP" :
      selectedNode.type === "KEY" ? "API_KEY" :
      selectedNode.type === "USER" ? "USER" : "ABUSE_FLAG";

    const targetId =
      selectedNode.type === "KEY" ? ((selectedNode.meta?.apiKeyId as string) || selectedNode.id.replace("KEY:", "")) :
      selectedNode.type === "USER" ? ((selectedNode.meta?.userId as string) || selectedNode.id.replace("USER:", "")) :
      selectedNode.type === "FLAG" ? ((selectedNode.meta?.flagId as string) || selectedNode.id.replace("FLAG:", "")) :
      selectedNode.label;

    await api(`/admin/incidents/${incident.id}/links`, {
      method: "POST",
      body: JSON.stringify({ type: linkType, targetId })
    });
  };

  return (
    <main className="h-[calc(100vh-72px)] bg-slate-50">
      <div className="grid h-full grid-cols-12 gap-3 p-3">
        <aside className="col-span-3 rounded-2xl bg-white p-4 shadow-soft">
          <h1 className="text-lg font-semibold text-slate-900">Threat Graph</h1>
          <div className="mt-4 space-y-2">
            <select className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={queryType} onChange={(e) => setQueryType(e.target.value as "domain" | "ip" | "key")}>
              <option value="domain">Domain</option>
              <option value="ip">IP</option>
              <option value="key">API Key ID</option>
            </select>
            <input className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white" onClick={() => void loadGraph()}>
              Load Graph
            </button>
          </div>

          <div className="mt-5 space-y-2 text-sm">
            <label className="flex items-center justify-between"><span>Live</span><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /></label>
            <label className="block">
              <span className="mb-1 block text-slate-500">Time window</span>
              <select className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value as TimeWindowKey)}>
                <option value="15m">Last 15m</option>
                <option value="1h">Last 1h</option>
                <option value="24h">Last 24h</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-500">Severity filter</span>
              <select className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")}>
                <option value="ALL">All</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>
          </div>

          <div className="mt-5 text-xs text-slate-600">
            <p className="font-medium">Node filters</p>
            {(["DOMAIN", "IP", "KEY", "USER", "FLAG"] as NodeType[]).map((t) => (
              <label key={t} className="mt-1 flex items-center justify-between">
                <span>{t}</span>
                <input checked={nodeFilter[t]} onChange={(e) => setNodeFilter((prev) => ({ ...prev, [t]: e.target.checked }))} type="checkbox" />
              </label>
            ))}
          </div>
          <div className="mt-6 text-xs text-slate-500">
            <p>Nodes: {filteredGraph.nodes.length}</p>
            <p>Edges: {filteredGraph.edges.length}</p>
          </div>
        </aside>

        <section className="col-span-6 rounded-2xl bg-white p-2 shadow-soft">
          <canvas ref={canvasRef} className="h-full w-full rounded-xl bg-slate-50" />
          {hoverNodeId && (
            <div className="pointer-events-none absolute ml-3 mt-3 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">
              {filteredGraph.nodes.find((n) => n.id === hoverNodeId)?.label}
            </div>
          )}
        </section>

        <aside className="col-span-3 rounded-2xl bg-white p-4 shadow-soft">
          <h2 className="text-base font-semibold text-slate-900">Inspector</h2>
          {!selectedNode && <p className="mt-3 text-sm text-slate-500">Click a node to inspect details.</p>}
          {selectedNode && (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <p className="font-medium">{selectedNode.type}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Label</p>
                <p className="font-medium break-all">{selectedNode.label}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Meta</p>
                <pre className="max-h-28 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">{JSON.stringify(selectedNode.meta || {}, null, 2)}</pre>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={selectedNode.type !== "IP"} onClick={() => void quickBlockIp()} className="rounded-lg border border-slate-200 px-2 py-2 text-xs disabled:opacity-40">Block IP</button>
                <button disabled={selectedNode.type !== "KEY"} onClick={() => void quickSuspendKey()} className="rounded-lg border border-slate-200 px-2 py-2 text-xs disabled:opacity-40">Suspend Key</button>
                <button onClick={() => void quickCreateIncident()} className="rounded-lg border border-slate-200 px-2 py-2 text-xs">Create Incident</button>
                <button onClick={() => void refreshLogsForSelected()} className="rounded-lg border border-slate-200 px-2 py-2 text-xs">Open Logs</button>
              </div>
              <div>
                <p className="text-xs text-slate-500">Recent Logs</p>
                <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {logsForSelected.map((l) => (
                    <div key={l.id} className="rounded-md bg-slate-50 px-2 py-1 text-xs">
                      <p>{l.endpoint}</p>
                      <p className="text-slate-500">{l.statusCode} · {new Date(l.createdAt).toLocaleTimeString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

