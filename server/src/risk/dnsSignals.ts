import { ModuleResult, RiskContext } from "./core";

const suspiciousNsTokens = ["duckdns", "no-ip", "ddns", "dynu", "hopto", "servehttp"];

export function dnsSignalsModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  if (ctx.isLikelyLoginTheme && ctx.hasSuspiciousTld) {
    scoreDelta += 10;
    confidenceDelta += 0.08;
    riskFactors.push("Login-themed domain on suspicious TLD suggests weak/abusive DNS posture");
  }

  if (suspiciousNsTokens.some((token) => ctx.fqdn.includes(token))) {
    scoreDelta += 12;
    confidenceDelta += 0.12;
    abuseSignals.push("Dynamic DNS / low-trust nameserver pattern detected");
  }

  if (/mail|smtp|support/.test(ctx.sld) && ctx.hasSuspiciousTld) {
    scoreDelta += 6;
    confidenceDelta += 0.06;
    abuseSignals.push("Email-themed naming on high-abuse TLD");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

