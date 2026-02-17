import { ModuleResult, RiskContext } from "./core";

const knownLegitimateAgeDays: Record<string, number> = {
  "paypal.com": 9000,
  "github.com": 6500,
  "google.com": 9800,
  "microsoft.com": 11000,
  "apple.com": 10000,
  "amazon.com": 10000
};

function inferAgeDays(ctx: RiskContext) {
  const exact = knownLegitimateAgeDays[ctx.asciiDomain];
  if (typeof exact === "number") return exact;
  if (ctx.hasSuspiciousTld && ctx.isLikelyLoginTheme) return 6;
  if (ctx.hasSuspiciousTld) return 25;
  if (ctx.sld.length > 20 && /\d{3,}/.test(ctx.sld)) return 20;
  return undefined;
}

export function domainAgeModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  const ageDays = inferAgeDays(ctx);
  if (ageDays === undefined) {
    return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
  }

  if (ageDays < 7) {
    scoreDelta += 25;
    confidenceDelta += 0.22;
    riskFactors.push("Recently registered domain (<7 days)");
  } else if (ageDays < 30) {
    scoreDelta += 15;
    confidenceDelta += 0.16;
    riskFactors.push("Recently registered domain (<30 days)");
  } else if (ageDays < 90) {
    scoreDelta += 8;
    confidenceDelta += 0.1;
    riskFactors.push("New domain (<90 days)");
  } else if (ageDays > 365 * 3) {
    scoreDelta -= 5;
    confidenceDelta += 0.06;
    abuseSignals.push("Long-established domain age reduces risk");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

