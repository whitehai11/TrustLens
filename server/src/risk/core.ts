import { domainToUnicode } from "node:url";
import { phishingSuffixes, suspiciousTlds } from "./weights";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ModuleResult = {
  scoreDelta: number;
  riskFactors: string[];
  abuseSignals: string[];
  confidenceDelta: number;
};

export type RiskContext = {
  domain: string;
  fqdn: string;
  asciiDomain: string;
  sld: string;
  tld: string;
  skeleton: string;
  confusableVariants: string[];
  labels: string[];
  hasSuspiciousTld: boolean;
  isLikelyLoginTheme: boolean;
  estimatedAgeDays?: number;
  knownAgeDays?: number;
  contentFetchEnabled: boolean;
};

export type ModuleExecution = {
  module: string;
  weight: number;
  weightedScoreDelta: number;
  result: ModuleResult;
};

export type FinalRiskResult = {
  score: number;
  riskLevel: RiskLevel;
  confidence: number;
  riskFactors: string[];
  abuseSignals: string[];
  technicalDetails: {
    modulesTriggered: string[];
    weightsUsed: Record<string, number>;
    moduleBreakdown: Array<{ module: string; scoreDelta: number; weightedScoreDelta: number; confidenceDelta: number }>;
  };
};

function skeletonize(value: string) {
  return value
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[01]/g, (m) => (m === "0" ? "o" : "l"));
}

function generateConfusableVariants(input: string): string[] {
  const transforms = [
    (v: string) => v.replace(/rn/g, "m"),
    (v: string) => v.replace(/vv/g, "w"),
    (v: string) => v.replace(/0/g, "o"),
    (v: string) => v.replace(/1/g, "l"),
    (v: string) => v.replace(/i/g, "l"),
    (v: string) => v.replace(/[-_.]+/g, "")
  ];
  const seen = new Set<string>();
  const queue: string[] = [skeletonize(input)];
  const limit = 24;
  while (queue.length && seen.size < limit) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const transform of transforms) {
      const next = skeletonize(transform(cur));
      if (!seen.has(next) && seen.size + queue.length < limit) queue.push(next);
    }
  }
  return Array.from(seen);
}

export function parseRiskContext(domain: string, contentFetchEnabled = false): RiskContext {
  const fqdn = domain.toLowerCase().trim().replace(/\.+$/g, "");
  const decoded = domainToUnicode(fqdn);
  const asciiDomain = decoded
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".");
  const labels = asciiDomain.split(".").filter(Boolean);
  const tld = labels.length > 1 ? labels[labels.length - 1] : "";
  const sld = labels.length > 1 ? labels[labels.length - 2] : labels[0] || "";
  const skeleton = skeletonize(sld);
  const confusableVariants = generateConfusableVariants(sld);
  const joined = `${sld}-${tld}`;
  const hasSuspiciousTld = suspiciousTlds.includes(tld);
  const isLikelyLoginTheme = phishingSuffixes.some((suffix) => joined.includes(suffix)) || /(signin|password|account|mail)/.test(joined);

  return {
    domain,
    fqdn,
    asciiDomain,
    sld,
    tld,
    skeleton,
    confusableVariants,
    labels,
    hasSuspiciousTld,
    isLikelyLoginTheme,
    contentFetchEnabled
  };
}

export function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}
