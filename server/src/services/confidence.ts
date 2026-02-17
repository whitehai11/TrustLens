export type ConfidenceLabel = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export type ConfidenceInput = {
  impersonationTriggered: boolean;
  independentModulesTriggered: number;
  historicalConsistency: boolean;
  hasAbuseFlags: boolean;
  hasApprovedCommunityReports: boolean;
  conflictingSignals: boolean;
  dataSparse: boolean;
};

export function computeConfidenceIndex(input: ConfidenceInput): { confidenceIndex: number; confidenceLabel: ConfidenceLabel } {
  let score = 0.3;
  if (input.impersonationTriggered) score += 0.2;
  if (input.independentModulesTriggered >= 3) score += 0.15;
  if (input.historicalConsistency) score += 0.1;
  if (input.hasAbuseFlags) score += 0.1;
  if (input.hasApprovedCommunityReports) score += 0.05;
  if (input.conflictingSignals) score -= 0.15;
  if (input.dataSparse) score -= 0.1;

  const confidenceIndex = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  let confidenceLabel: ConfidenceLabel = "LOW";
  if (confidenceIndex >= 0.86) confidenceLabel = "VERY_HIGH";
  else if (confidenceIndex >= 0.61) confidenceLabel = "HIGH";
  else if (confidenceIndex >= 0.31) confidenceLabel = "MODERATE";
  return { confidenceIndex, confidenceLabel };
}
