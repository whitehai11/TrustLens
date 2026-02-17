import { evaluateDomainRisk } from "../risk";

export type DomainRiskResult = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number; // 0..1
  riskFactors: string[];
  abuseSignals: string[];
  historicalTrend: "improving" | "stable" | "worsening";
  explanation: string;
  technicalDetails: {
    modulesTriggered: string[];
    weightsUsed: Record<string, number>;
    moduleBreakdown: Array<{ module: string; scoreDelta: number; weightedScoreDelta: number; confidenceDelta: number }>;
  };
};

export function analyzeDomain(domain: string): DomainRiskResult {
  const evaluated = evaluateDomainRisk(domain);
  const { score, riskLevel, confidence, riskFactors, abuseSignals, technicalDetails } = evaluated;

  const historicalTrend = riskLevel === "HIGH" ? "worsening" : riskLevel === "MEDIUM" ? "stable" : "improving";
  const trend = riskLevel === "CRITICAL" ? "worsening" : historicalTrend;

  const explanation =
    riskFactors.some((f) => f.toLowerCase().includes("impersonation") || f.toLowerCase().includes("brand"))
      ? "This domain shows strong brand-impersonation characteristics (typosquatting/confusables), which is commonly used in phishing and credential theft campaigns."
      : riskLevel === "CRITICAL"
        ? "Multiple high-confidence malicious indicators align across independent modules; this domain should be treated as actively dangerous."
        : riskLevel === "HIGH"
        ? "Strong overlap with known scam-domain patterns. Manual verification is strongly recommended."
        : riskLevel === "MEDIUM"
          ? "Mixed indicators detected. Treat this domain carefully and validate ownership before engaging."
          : "No strong abuse markers detected in lightweight heuristic checks.";

  return {
    score,
    riskLevel,
    confidence,
    riskFactors,
    abuseSignals,
    historicalTrend: trend,
    explanation,
    technicalDetails
  };
}
