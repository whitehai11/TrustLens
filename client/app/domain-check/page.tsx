"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  checkDomain,
  checkDomainVerification,
  createDomainDispute,
  DomainCheckResponse,
  DomainReputationResponse,
  getDomainReputation,
  requestDomainVerification
} from "@/lib/api";

export default function DomainCheckPage() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<DomainCheckResponse | null>(null);
  const [reputation, setReputation] = useState<DomainReputationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);
  const [verifyInstructions, setVerifyInstructions] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputeStatus, setDisputeStatus] = useState<string | null>(null);

  const scoreWidth = useMemo(() => `${result?.score || 0}%`, [result]);
  const confidenceWidth = useMemo(() => `${Math.round((result?.confidenceIndex || 0) * 100)}%`, [result]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setReputation(null);
    setDisputeStatus(null);

    try {
      const normalized = domain.trim().toLowerCase();
      const data = await checkDomain(normalized);
      setResult(data);
      const rep = await getDomainReputation(normalized);
      setReputation(rep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check domain");
    } finally {
      setLoading(false);
    }
  }

  async function requestVerification() {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return;
    const token = window.localStorage.getItem("trustlens_token") || undefined;
    if (!token) {
      setVerifyStatus("Login required to request verification.");
      return;
    }
    setVerifyBusy(true);
    setVerifyStatus(null);
    try {
      const response = await requestDomainVerification({ domain: normalized, method: "DNS", token });
      setVerifyInstructions(response?.instructions?.text || "DNS challenge created.");
      setVerifyStatus("Verification challenge created.");
    } catch (err) {
      setVerifyStatus(err instanceof Error ? err.message : "Failed to create verification challenge");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function runVerificationCheck() {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return;
    const token = window.localStorage.getItem("trustlens_token") || undefined;
    if (!token) {
      setVerifyStatus("Login required to verify ownership.");
      return;
    }
    setVerifyBusy(true);
    try {
      await checkDomainVerification({ domain: normalized, token });
      const rep = await getDomainReputation(normalized);
      setReputation(rep);
      setVerifyStatus("Domain ownership verified.");
    } catch (err) {
      setVerifyStatus(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function submitDispute() {
    const normalized = domain.trim().toLowerCase();
    if (!normalized || disputeReason.trim().length < 10) return;
    const token = window.localStorage.getItem("trustlens_token") || undefined;
    if (!token) {
      setDisputeStatus("Login required to open dispute.");
      return;
    }
    try {
      await createDomainDispute({
        domain: normalized,
        reason: disputeReason.trim(),
        evidenceUrl: disputeEvidence.trim() || undefined,
        token
      });
      setDisputeReason("");
      setDisputeEvidence("");
      setDisputeStatus("Dispute submitted. Admin review has been triggered.");
    } catch (err) {
      setDisputeStatus(err instanceof Error ? err.message : "Failed to submit dispute");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Domain Check</h1>
      <p className="mt-3 text-slate-600">Analyze suspicious behavior signals and get a transparent risk breakdown.</p>

      <form onSubmit={submit} className="mt-8 rounded-3xl bg-white/95 p-6 shadow-soft">
        <label className="mb-2 block text-sm font-medium text-slate-700">Domain</label>
        <input
          required
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-base outline-none ring-1 ring-slate-200 focus:ring-slate-300"
        />
        <button
          disabled={loading}
          className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Checking..." : "Check Domain"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {result && (
        <section className="mt-8 animate-fadeUp rounded-3xl bg-white/95 p-7 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Risk Result</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{result.riskLevel}</span>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-sm text-slate-600">
                <span>Risk Score</span>
                <span>{result.score}/100</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: scoreWidth }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-sm text-slate-600">
                <span title="Confidence reflects how strongly independent signals support this assessment.">Confidence</span>
                <span>{result.confidenceIndex.toFixed(2)} ({result.confidenceLabel})</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-500 transition-all duration-500" style={{ width: confidenceWidth }} />
              </div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-slate-700">{result.explanation}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Risk factors</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {result.riskFactors.length ? result.riskFactors.map((f) => <li key={f}>- {f}</li>) : <li>- No major factors found</li>}
              </ul>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Abuse signals</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {result.abuseSignals.length ? result.abuseSignals.map((f) => <li key={f}>- {f}</li>) : <li>- No known abuse signal</li>}
              </ul>
            </div>
          </div>

          {reputation && (
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Reputation</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{reputation.riskLevel}</span>
              </div>
              {reputation.verifiedOwner && (
                <div
                  title="Domain ownership verified via DNS challenge."
                  className="mt-3 inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
                >
                  Verified Domain Owner
                </div>
              )}
              <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <p>Reputation score: <span className="font-semibold text-slate-900">{reputation.reputationScore}/100</span></p>
                <p>Reputation confidence: <span className="font-semibold text-slate-900">{Math.round(reputation.confidence * 100)}%</span></p>
                <p>Approved reports: <span className="font-semibold text-slate-900">{reputation.counts.approved}</span></p>
                <p>Last updated: <span className="font-semibold text-slate-900">{new Date(reputation.lastComputedAt).toLocaleString()}</span></p>
                {reputation.verifiedAt && <p>Verified at: <span className="font-semibold text-slate-900">{new Date(reputation.verifiedAt).toLocaleString()}</span></p>}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/report-domain?domain=${encodeURIComponent(domain.trim().toLowerCase())}`}
              className="inline-flex rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-700"
            >
              Report this domain
            </Link>
            <button
              type="button"
              onClick={() => void requestVerification()}
              disabled={verifyBusy}
              className="inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Request ownership verification
            </button>
            <button
              type="button"
              onClick={() => void runVerificationCheck()}
              disabled={verifyBusy}
              className="inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Verify now
            </button>
          </div>
          {verifyInstructions && <p className="mt-3 text-sm text-slate-600">{verifyInstructions}</p>}
          {verifyStatus && <p className="mt-2 text-sm text-slate-600">{verifyStatus}</p>}

          {reputation?.verifiedOwner && (
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Owner Dispute</p>
              <p className="mt-1 text-xs text-slate-500">Submitting a dispute triggers manual review and does not auto-lower risk.</p>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                rows={3}
                placeholder="Explain why this risk result should be reviewed"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
              <input
                value={disputeEvidence}
                onChange={(e) => setDisputeEvidence(e.target.value)}
                placeholder="Evidence URL (optional)"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => void submitDispute()}
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Submit dispute
              </button>
              {disputeStatus && <p className="mt-2 text-sm text-slate-600">{disputeStatus}</p>}
            </div>
          )}

          {reputation?.verifiedOwner && !["HIGH", "CRITICAL"].includes(reputation.riskLevel) && (
            <p className="mt-2 text-xs text-slate-500">
              Badge URL: {`http://localhost:4000/api/domain/${domain.trim().toLowerCase()}/badge.svg`}
            </p>
          )}

          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <button
              type="button"
              onClick={() => setShowMethodology((v) => !v)}
              className="text-sm font-semibold text-slate-900"
            >
              {showMethodology ? "Hide" : "Show"} Methodology & Disclaimer
            </button>
            {showMethodology && (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                TrustLens combines heuristic modules, moderated community feedback, ownership verification signals, and continuous updates.
                Assessments are informational only and should be validated with independent due diligence.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
