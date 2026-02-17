export type StatsResponse = {
  reports_24h: number;
  reports_7d: number;
  reports_30d: number;
  reports_1y: number;
  total_domains_checked: number;
};

export type DomainCheckResponse = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  confidenceIndex: number;
  confidenceLabel: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  riskFactors: string[];
  abuseSignals: string[];
  historicalTrend: "improving" | "stable" | "worsening";
  explanation: string;
  timestamp: string;
};

export type DomainReputationResponse = {
  domain: string;
  reputationScore: number;
  riskLevel: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  verifiedOwner: boolean;
  verifiedAt: string | null;
  lastComputedAt: string;
  signals: {
    reportsApproved: number;
    reportsRejected: number;
    topCategories: Array<{ category: string; count: number }>;
    impersonationHit: boolean;
    abuseFlags: { low: number; medium: number; high: number };
    historyTrend: "IMPROVING" | "STABLE" | "WORSENING";
    avgRiskScore30d: number;
    latestRiskScore: number | null;
  };
  counts: {
    feedbackTotal: number;
    approved: number;
    rejected: number;
    pending: number;
  };
};

export type TldRiskRow = {
  tld: string;
  totalDomains: number;
  highRiskCount: number;
  criticalCount: number;
  tldRiskRatio: number;
};

export type TransparencyResponse = {
  total_domains_analyzed: number;
  total_reports_submitted: number;
  reports_approved: number;
  reports_rejected: number;
  verified_domains_count: number;
  open_disputes: number;
  abuse_flags_generated: number;
  average_risk_score: number;
  top_tld_risk_ratios: TldRiskRow[];
  note: string;
};

const BASE = "http://localhost:4000";

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/api/stats`, { cache: "no-store" });
  return parseJson<StatsResponse>(res);
}

export async function getTldStats(days?: number): Promise<{ note: string; rows: TldRiskRow[] }> {
  const qs = typeof days === "number" ? `?days=${days}` : "";
  const res = await fetch(`${BASE}/api/stats/tld${qs}`, { cache: "no-store" });
  return parseJson<{ note: string; rows: TldRiskRow[] }>(res);
}

export async function getTransparencyStats(): Promise<TransparencyResponse> {
  const res = await fetch(`${BASE}/api/stats/transparency`, { cache: "no-store" });
  return parseJson<TransparencyResponse>(res);
}

export async function checkDomain(domain: string, apiKey?: string): Promise<DomainCheckResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${BASE}/api/domain/check`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ domain })
  });

  return parseJson<DomainCheckResponse>(res);
}

export async function getDomainReputation(domain: string): Promise<DomainReputationResponse> {
  const res = await fetch(`${BASE}/api/domain/${encodeURIComponent(domain)}/reputation`, {
    credentials: "include",
    cache: "no-store"
  });
  return parseJson<DomainReputationResponse>(res);
}

export async function requestDomainVerification(payload: { domain: string; method?: "DNS" | "HTTP"; token?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.token) headers.Authorization = `Bearer ${payload.token}`;
  const res = await fetch(`${BASE}/api/domain/${encodeURIComponent(payload.domain)}/verify-request`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ method: payload.method || "DNS" })
  });
  return parseJson<{
    verificationId: string;
    domain: string;
    method: "DNS" | "HTTP";
    status: string;
    expiresAt: string;
    instructions?: { text?: string };
  }>(res);
}

export async function checkDomainVerification(payload: { domain: string; token?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.token) headers.Authorization = `Bearer ${payload.token}`;
  const res = await fetch(`${BASE}/api/domain/${encodeURIComponent(payload.domain)}/verify-check`, {
    method: "POST",
    headers,
    credentials: "include",
    body: "{}"
  });
  return parseJson<{ success: boolean; verificationId: string; status: string }>(res);
}

export async function createDomainDispute(payload: { domain: string; reason: string; evidenceUrl?: string; token?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.token) headers.Authorization = `Bearer ${payload.token}`;
  const res = await fetch(`${BASE}/api/domain/${encodeURIComponent(payload.domain)}/dispute`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ reason: payload.reason, evidenceUrl: payload.evidenceUrl })
  });
  return parseJson(res);
}

export async function reportDomain(payload: {
  domain: string;
  category: string;
  reason: string;
  details: string;
  evidenceLink?: string;
  reporterEmail?: string;
  token?: string;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.token) headers.Authorization = `Bearer ${payload.token}`;

  const res = await fetch(`${BASE}/api/domain/report`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      domain: payload.domain,
      category: payload.category,
      reason: payload.reason,
      details: payload.details,
      evidenceLink: payload.evidenceLink,
      reporterEmail: payload.reporterEmail
    })
  });

  return parseJson(res);
}

export async function createSupportTicket(payload: {
  subject: string;
  message: string;
  reporterEmail?: string;
  token?: string;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (payload.token) headers.Authorization = `Bearer ${payload.token}`;

  const res = await fetch(`${BASE}/api/tickets`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload)
  });

  return parseJson(res);
}
