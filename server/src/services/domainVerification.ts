import crypto from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { DomainVerificationMethod } from "@prisma/client";

export function normalizeDomain(input: string): string {
  return String(input || "").toLowerCase().trim();
}

export function verificationTxtValue(token: string): string {
  return `trustlens-verification=${token}`;
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function isChallengeExpired(expiresAt: Date, nowMs = Date.now()): boolean {
  return expiresAt.getTime() <= nowMs;
}

export function dnsRecordsContainToken(records: string[][], token: string): boolean {
  const expected = verificationTxtValue(token);
  for (const row of records) {
    const joined = row.join("");
    if (joined.trim() === expected) return true;
  }
  return false;
}

export function httpBodyContainsToken(body: string, token: string): boolean {
  const expected = verificationTxtValue(token);
  return body
    .split("\n")
    .map((line) => line.trim())
    .includes(expected);
}

export async function checkDnsVerification(domain: string, token: string): Promise<boolean> {
  const host = `_trustlens.${normalizeDomain(domain)}`;
  try {
    const records = await resolveTxt(host);
    return dnsRecordsContainToken(records, token);
  } catch {
    return false;
  }
}

export async function checkHttpVerification(domain: string, token: string): Promise<boolean> {
  const normalized = normalizeDomain(domain);
  try {
    const response = await fetch(`https://${normalized}/.well-known/trustlens.txt`, {
      method: "GET",
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) return false;
    const body = await response.text();
    return httpBodyContainsToken(body, token);
  } catch {
    return false;
  }
}

export async function validateDomainVerification(opts: { domain: string; token: string; method: DomainVerificationMethod }): Promise<boolean> {
  if (opts.method === DomainVerificationMethod.HTTP) {
    return checkHttpVerification(opts.domain, opts.token);
  }
  return checkDnsVerification(opts.domain, opts.token);
}

export function isBadgeEligible(input: { verifiedOwner: boolean; riskLevel: string }): boolean {
  return input.verifiedOwner && !["HIGH", "CRITICAL"].includes(String(input.riskLevel).toUpperCase());
}

export function buildVerifiedBadgeSvg(domain: string): string {
  const safeDomain = domain.replace(/[<>&"]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64" role="img" aria-label="Verified by TrustLens">
  <rect width="320" height="64" rx="12" fill="#111111"/>
  <circle cx="28" cy="32" r="12" fill="#ffffff"/>
  <path d="M22 32l4 4 8-8" stroke="#111111" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="52" y="28" font-size="14" fill="#ffffff" font-family="Arial, sans-serif">Verified by TrustLens</text>
  <text x="52" y="46" font-size="12" fill="#d4d4d4" font-family="Arial, sans-serif">${safeDomain}</text>
</svg>`;
}
