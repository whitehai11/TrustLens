"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSSE, RealtimeEvent } from "../../lib/realtime/useSSE";

const API_BASE = "http://localhost:4000/api";

type Snapshot = {
  requests_last_1m: number;
  requests_last_5m: number;
  errors_last_5m: number;
  open_tickets: number;
  pending_reports: number;
  active_keys: number;
  suspended_keys: number;
  top_ip_last_5m: { value: string; count: number } | null;
  top_domain_last_5m: { value: string; count: number } | null;
};

type LogRow = {
  logId: string;
  endpoint: string;
  method: string;
  domain?: string | null;
  ipAddress: string;
  statusCode: number;
  durationMs: number;
  createdAt?: string;
};

type AbuseRow = {
  id: string;
  kind: string;
  severity: string;
  apiKeyId?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
};

type TicketRow = { id: string; subject: string; status: string; priority: string; updatedAt?: string };
type ReportRow = { id: string; domain: string; moderationStatus: string; createdAt?: string };
type FeedbackRow = {
  id: string;
  domain: string;
  category: string;
  description: string;
  status: string;
  evidenceUrl?: string | null;
  createdAt: string;
  user?: { email?: string };
  email?: string | null;
};
type ReputationRow = {
  domain: string;
  reputationScore: number;
  riskLevel: string;
  confidence: number;
  lastComputedAt: string;
  counts: { approved: number; rejected: number; pending: number };
};
type DomainVerificationRow = {
  id: string;
  domain: string;
  method: "DNS" | "HTTP";
  status: "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";
  createdAt: string;
  verifiedAt?: string | null;
  expiresAt: string;
  user: { id: string; email: string; role: string };
};
type TldRiskRow = {
  tld: string;
  totalDomains: number;
  highRiskCount: number;
  criticalCount: number;
  tldRiskRatio: number;
};
type DomainDisputeRow = {
  id: string;
  domain: string;
  reason: string;
  evidenceUrl?: string | null;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";
  adminNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  user: { id: string; email: string; role: string };
};

type NotificationFilter = "ALL" | "INCIDENTS" | "TICKETS" | "REPORTS" | "KEYS_IP";
type NotificationItem = { id: string; title: string; category: NotificationFilter; at: string };
type ToastItem = { id: string; text: string };

function getToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("trustlens_token") || "";
}

async function apiGet<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Request failed: ${path}`);
  return (await res.json()) as T;
}

function eventCategory(type: string): NotificationFilter {
  if (type === "ABUSE_FLAG_CREATED") return "INCIDENTS";
  if (type === "TICKET_CREATED" || type === "TICKET_UPDATED") return "TICKETS";
  if (type === "REPORT_CREATED" || type === "REPORT_MODERATED") return "REPORTS";
  if (type === "KEY_STATUS_CHANGED" || type === "IP_RULE_CHANGED") return "KEYS_IP";
  return "ALL";
}

export default function AdminPage() {
  const [pageError, setPageError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [abuse, setAbuse] = useState<AbuseRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [tldRows, setTldRows] = useState<TldRiskRow[]>([]);
  const [tldDays, setTldDays] = useState(30);
  const [disputes, setDisputes] = useState<DomainDisputeRow[]>([]);
  const [recomputeDomain, setRecomputeDomain] = useState("");
  const [recomputeResult, setRecomputeResult] = useState<ReputationRow | null>(null);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [verifications, setVerifications] = useState<DomainVerificationRow[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [liveTail, setLiveTail] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotificationFilter>("ALL");
  const [muteAlerts, setMuteAlerts] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const liveTailRef = useRef(liveTail);
  const snapshotRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    liveTailRef.current = liveTail;
  }, [liveTail]);

  const pushToast = useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [{ id, text }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const pushNotification = useCallback((title: string, category: NotificationFilter, at: string) => {
    setNotifications((prev) => [{ id: `${Date.now()}-${Math.random()}`, title, category, at }, ...prev].slice(0, 50));
  }, []);

  const addActivity = useCallback((line: string) => {
    setActivity((prev) => [line, ...prev].slice(0, 100));
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const next = await apiGet<Snapshot>("/admin/realtime/snapshot");
    setSnapshot(next);
  }, []);

  const queueSnapshotRefresh = useCallback(() => {
    if (snapshotRefreshTimerRef.current) return;
    snapshotRefreshTimerRef.current = setTimeout(() => {
      snapshotRefreshTimerRef.current = null;
      void refreshSnapshot();
    }, 500);
  }, [refreshSnapshot]);

  useEffect(() => {
    const load = async () => {
      try {
        const [snap, logRows, abuseRows, ticketRows, reportRows, feedbackRows, verificationRows, tldResponse, disputeRows] = await Promise.all([
          apiGet<Snapshot>("/admin/realtime/snapshot"),
          apiGet<Array<{ id: string; endpoint: string; method: string; domain?: string | null; ipAddress: string; statusCode: number; durationMs: number; createdAt?: string }>>("/admin/logs"),
          apiGet<AbuseRow[]>("/admin/abuse?unresolved=true"),
          apiGet<TicketRow[]>("/admin/tickets"),
          apiGet<ReportRow[]>("/admin/reports?status=PENDING"),
          apiGet<FeedbackRow[]>("/admin/feedback?status=PENDING"),
          apiGet<DomainVerificationRow[]>("/admin/domain-verifications"),
          apiGet<{ rows: TldRiskRow[] }>(`/stats/tld?days=${tldDays}`),
          apiGet<DomainDisputeRow[]>("/admin/disputes")
        ]);
        setSnapshot(snap);
        setLogs(
          logRows.slice(0, 200).map((row) => ({
            logId: row.id,
            endpoint: row.endpoint,
            method: row.method,
            domain: row.domain,
            ipAddress: row.ipAddress,
            statusCode: row.statusCode,
            durationMs: row.durationMs,
            createdAt: row.createdAt
          }))
        );
        setAbuse(abuseRows);
        setTickets(ticketRows);
        setReports(reportRows);
        setFeedback(feedbackRows);
        setVerifications(verificationRows);
        setTldRows(tldResponse.rows || []);
        setDisputes(disputeRows);
        setPageError(null);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Network error while loading admin data");
      }
    };
    void load();
  }, [tldDays]);

  const moderateFeedback = useCallback(async (id: string, action: "approve" | "reject") => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/admin/feedback/${id}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error(`Failed to ${action} feedback`);
      setFeedback((prev) => prev.filter((f) => f.id !== id));
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to moderate feedback");
    }
  }, []);

  const runRecompute = useCallback(async () => {
    if (!recomputeDomain.trim()) return;
    setRecomputeBusy(true);
    try {
      const data = await apiGet<ReputationRow>(`/admin/domain/${encodeURIComponent(recomputeDomain.trim().toLowerCase())}/reputation/recompute`);
      setRecomputeResult(data);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to recompute reputation");
    } finally {
      setRecomputeBusy(false);
    }
  }, [recomputeDomain]);

  const revokeVerification = useCallback(async (id: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/admin/domain-verifications/${id}/revoke`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ note: "Revoked by admin UI" })
      });
      if (!res.ok) throw new Error("Failed to revoke verification");
      setVerifications((prev) => prev.map((v) => (v.id === id ? { ...v, status: "FAILED", verifiedAt: null } : v)));
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to revoke verification");
    }
  }, []);

  const updateDispute = useCallback(async (id: string, status: "UNDER_REVIEW" | "RESOLVED" | "REJECTED") => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/admin/disputes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ status, adminNote: `Updated to ${status} from admin UI` })
      });
      if (!res.ok) throw new Error("Failed to update dispute");
      const updated = (await res.json()) as DomainDisputeRow;
      setDisputes((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to update dispute");
    }
  }, []);

  const recalculateTldStats = useCallback(async () => {
    try {
      const token = getToken();
      const recalcRes = await fetch(`${API_BASE}/admin/tld/recalculate`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!recalcRes.ok) throw new Error("Failed to recalculate TLD stats");
      const next = await apiGet<{ rows: TldRiskRow[] }>(`/stats/tld?days=${tldDays}`);
      setTldRows(next.rows || []);
      setPageError(null);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to recalculate TLD stats");
    }
  }, [tldDays]);

  const handlers = useMemo(
    () => ({
      onEvent: (event: RealtimeEvent) => {
        const category = eventCategory(event.type);
        pushNotification(`${event.type} at ${new Date(event.createdAt).toLocaleTimeString()}`, category, event.createdAt);
        addActivity(`${event.type} | ${new Date(event.createdAt).toLocaleTimeString()}`);
        queueSnapshotRefresh();
      },
      onLogCreated: (event: RealtimeEvent) => {
        if (!liveTailRef.current) return;
        const payload = event.payload as LogRow;
        setLogs((prev) => [{ ...payload, createdAt: event.createdAt }, ...prev].slice(0, 200));
      },
      onAbuseFlagCreated: (event: RealtimeEvent) => {
        const payload = event.payload as { flagId: string; kind: string; severity: string; apiKeyId?: string | null; ipAddress?: string | null };
        setAbuse((prev) => [{ id: payload.flagId, kind: payload.kind, severity: payload.severity, apiKeyId: payload.apiKeyId, ipAddress: payload.ipAddress, createdAt: event.createdAt }, ...prev]);
        if (payload.severity === "HIGH") {
          pushToast("High severity abuse flag detected");
          if (!muteAlerts) {
            // sound is intentionally omitted by default; mute controls high-volume alert behavior
          }
        }
      },
      onTicketCreated: (event: RealtimeEvent) => {
        const payload = event.payload as { ticketId: string; subject: string; status: string; priority: string };
        setTickets((prev) => [{ id: payload.ticketId, subject: payload.subject, status: payload.status, priority: payload.priority, updatedAt: event.createdAt }, ...prev]);
        pushToast("New ticket created");
      },
      onTicketUpdated: (event: RealtimeEvent) => {
        const payload = event.payload as { ticketId: string; status?: string };
        setTickets((prev) => prev.map((t) => (t.id === payload.ticketId ? { ...t, status: payload.status || t.status, updatedAt: event.createdAt } : t)));
      },
      onReportCreated: (event: RealtimeEvent) => {
        const payload = event.payload as { reportId: string; domain: string; moderationStatus: string };
        if (payload.moderationStatus === "PENDING") {
          setReports((prev) => [{ id: payload.reportId, domain: payload.domain, moderationStatus: payload.moderationStatus, createdAt: event.createdAt }, ...prev]);
        }
      },
      onReportModerated: (event: RealtimeEvent) => {
        const payload = event.payload as { reportId: string; moderationStatus: string };
        if (payload.moderationStatus !== "PENDING") {
          setReports((prev) => prev.filter((r) => r.id !== payload.reportId));
        }
      },
      onKeyStatusChanged: (event: RealtimeEvent) => {
        const payload = event.payload as { status?: string };
        if (payload.status === "SUSPENDED") pushToast("API key suspended");
      }
    }),
    [addActivity, muteAlerts, pushNotification, pushToast, queueSnapshotRefresh]
  );

  const { connected, reconnecting } = useSSE(`${API_BASE}/admin/realtime/stream`, handlers);

  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => {
      void refreshSnapshot();
    }, 10_000);
    return () => clearInterval(timer);
  }, [connected, refreshSnapshot]);

  const filteredNotifications = notifications.filter((n) => notifFilter === "ALL" || n.category === notifFilter);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="relative flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Security Control Center</h1>
          <p className="mt-2 text-sm text-slate-600">
            Stream: {connected ? <span className="text-emerald-600">LIVE</span> : reconnecting ? <span className="text-amber-600">Reconnecting...</span> : <span className="text-rose-600">Offline (polling)</span>}
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setNotifOpen((v) => !v)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-soft">
            Bell ({notifications.length})
          </button>
          {notifOpen && (
            <div className="absolute right-0 z-20 mt-2 w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <select
                  value={notifFilter}
                  onChange={(e) => setNotifFilter(e.target.value as NotificationFilter)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="INCIDENTS">Incidents</option>
                  <option value="TICKETS">Tickets</option>
                  <option value="REPORTS">Reports</option>
                  <option value="KEYS_IP">Keys/IP rules</option>
                </select>
                <button onClick={() => setMuteAlerts((v) => !v)} className="text-xs text-slate-600">
                  {muteAlerts ? "Unmute alerts" : "Mute alerts"}
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {filteredNotifications.map((n) => (
                  <div key={n.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-medium text-slate-800">{n.title}</p>
                    <p className="text-xs text-slate-500">{new Date(n.at).toLocaleString()}</p>
                  </div>
                ))}
                {filteredNotifications.length === 0 && <p className="text-sm text-slate-500">No notifications.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
      {pageError && <p className="mt-3 text-sm text-rose-600">{pageError}</p>}

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Requests (1m)</p><p className="mt-2 text-2xl font-semibold">{snapshot?.requests_last_1m ?? 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Requests (5m)</p><p className="mt-2 text-2xl font-semibold">{snapshot?.requests_last_5m ?? 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Errors (5m)</p><p className="mt-2 text-2xl font-semibold">{snapshot?.errors_last_5m ?? 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Open Tickets</p><p className="mt-2 text-2xl font-semibold">{snapshot?.open_tickets ?? 0}</p></div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Pending Reports</p><p className="mt-2 text-2xl font-semibold">{snapshot?.pending_reports ?? 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Active Keys</p><p className="mt-2 text-2xl font-semibold">{snapshot?.active_keys ?? 0}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs text-slate-500">Suspended Keys</p><p className="mt-2 text-2xl font-semibold">{snapshot?.suspended_keys ?? 0}</p></div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Incidents (Live)</h2>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto">
            {abuse.slice(0, 40).map((flag) => (
              <div key={flag.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium">{flag.kind} <span className="ml-2 text-xs text-slate-500">{flag.severity}</span></p>
                <p className="text-xs text-slate-500">{flag.ipAddress || flag.apiKeyId || "n/a"}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto text-sm text-slate-700">
            {activity.map((line, i) => <p key={`${line}-${i}`}>{line}</p>)}
            {activity.length === 0 && <p className="text-slate-500">Waiting for live events...</p>}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold">Domain Verifications</h2>
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2">Domain</th><th>Owner</th><th>Method</th><th>Status</th><th>Created</th><th>Action</th></tr>
            </thead>
            <tbody>
              {verifications.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="py-2">{v.domain}</td>
                  <td>{v.user.email}</td>
                  <td>{v.method}</td>
                  <td>{v.status}</td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                  <td>
                    {v.status === "VERIFIED" ? (
                      <button onClick={() => void revokeVerification(v.id)} className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white">Revoke</button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {verifications.length === 0 && <p className="text-sm text-slate-500">No verification requests yet.</p>}
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">TLD Risk Analytics</h2>
          <div className="flex items-center gap-2">
            <select
              value={tldDays}
              onChange={(e) => setTldDays(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button
              onClick={() => void recalculateTldStats()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Recalculate
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">TLD</th>
                <th>Total</th>
                <th>High</th>
                <th>Critical</th>
                <th>Risk ratio</th>
              </tr>
            </thead>
            <tbody>
              {tldRows.map((row) => (
                <tr key={row.tld} className="border-t border-slate-100">
                  <td className="py-2">.{row.tld}</td>
                  <td>{row.totalDomains}</td>
                  <td>{row.highRiskCount}</td>
                  <td>{row.criticalCount}</td>
                  <td>{(row.tldRiskRatio * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tldRows.length === 0 && <p className="text-sm text-slate-500">No TLD analytics yet.</p>}
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold">Domain Disputes</h2>
        <div className="mt-4 max-h-96 space-y-3 overflow-auto">
          {disputes.map((d) => (
            <div key={d.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {d.domain} <span className="ml-2 rounded bg-white px-2 py-0.5 text-xs">{d.status}</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">{d.reason}</p>
              <p className="mt-1 text-xs text-slate-500">{d.user.email} • {new Date(d.createdAt).toLocaleString()}</p>
              {d.evidenceUrl && (
                <a href={d.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline">
                  Evidence
                </a>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => void updateDispute(d.id, "UNDER_REVIEW")} className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-800">
                  Under review
                </button>
                <button onClick={() => void updateDispute(d.id, "RESOLVED")} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  Resolve
                </button>
                <button onClick={() => void updateDispute(d.id, "REJECTED")} className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
                  Reject
                </button>
              </div>
            </div>
          ))}
          {disputes.length === 0 && <p className="text-sm text-slate-500">No disputes currently open.</p>}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Feedback Moderation Queue</h2>
          <div className="mt-4 max-h-80 space-y-3 overflow-auto">
            {feedback.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{item.domain} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{item.category}</span></p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.description}</p>
                <p className="mt-1 text-xs text-slate-500">{item.user?.email || item.email || "anonymous"} • {new Date(item.createdAt).toLocaleString()}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void moderateFeedback(item.id, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Approve</button>
                  <button onClick={() => void moderateFeedback(item.id, "reject")} className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Reject</button>
                </div>
              </div>
            ))}
            {feedback.length === 0 && <p className="text-sm text-slate-500">No pending feedback.</p>}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Domain Reputation Recompute</h2>
          <div className="mt-4 flex gap-2">
            <input
              value={recomputeDomain}
              onChange={(e) => setRecomputeDomain(e.target.value)}
              placeholder="example.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
            />
            <button
              onClick={() => void runRecompute()}
              disabled={recomputeBusy}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {recomputeBusy ? "Computing..." : "Recompute"}
            </button>
          </div>
          {recomputeResult && (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              <p><span className="font-semibold">Domain:</span> {recomputeResult.domain}</p>
              <p><span className="font-semibold">Reputation:</span> {recomputeResult.reputationScore} ({recomputeResult.riskLevel})</p>
              <p><span className="font-semibold">Confidence:</span> {Math.round(recomputeResult.confidence * 100)}%</p>
              <p><span className="font-semibold">Approved/Rejected/Pending:</span> {recomputeResult.counts.approved}/{recomputeResult.counts.rejected}/{recomputeResult.counts.pending}</p>
              <p><span className="font-semibold">Updated:</span> {new Date(recomputeResult.lastComputedAt).toLocaleString()}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Usage Logs</h2>
          <button
            onClick={() => setLiveTail((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${liveTail ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
          >
            {liveTail ? "LIVE tail ON" : "LIVE tail OFF"}
          </button>
        </div>
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2">Method</th><th>Endpoint</th><th>Domain</th><th>IP</th><th>Status</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.logId} className="border-t border-slate-100">
                  <td className="py-2">{log.method}</td>
                  <td>{log.endpoint}</td>
                  <td>{log.domain || "-"}</td>
                  <td>{log.ipAddress}</td>
                  <td>{log.statusCode}</td>
                  <td>{log.durationMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Tickets</h2>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto">
            {tickets.slice(0, 50).map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium">{t.subject}</p>
                <p className="text-xs text-slate-500">{t.status} · {t.priority}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Pending Reports</h2>
          <div className="mt-4 max-h-72 space-y-2 overflow-auto">
            {reports.slice(0, 50).map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium">{r.domain}</p>
                <p className="text-xs text-slate-500">{r.moderationStatus}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-soft">
          <p className="text-xs text-slate-500">Top IP (5m)</p>
          <p className="mt-2 text-lg font-semibold">{snapshot?.top_ip_last_5m ? `${snapshot.top_ip_last_5m.value} (${snapshot.top_ip_last_5m.count})` : "n/a"}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-soft">
          <p className="text-xs text-slate-500">Top Domain (5m)</p>
          <p className="mt-2 text-lg font-semibold">{snapshot?.top_domain_last_5m ? `${snapshot.top_domain_last_5m.value} (${snapshot.top_domain_last_5m.count})` : "n/a"}</p>
        </div>
      </section>

      <div className="pointer-events-none fixed bottom-6 right-6 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}
