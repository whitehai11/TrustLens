import { abuseHeuristicsModule } from "./abuseHeuristics";
import { FinalRiskResult, ModuleExecution, ModuleResult, clampScore, getRiskLevel, parseRiskContext } from "./core";
import { contentSignalsModule } from "./contentSignals";
import { dnsSignalsModule } from "./dnsSignals";
import { domainAgeModule } from "./domainAge";
import { entropyModule } from "./entropy";
import { impersonationModule } from "./impersonation";
import { infrastructureSignalsModule } from "./infrastructureSignals";
import { lexicalSignalsModule } from "./lexicalSignals";
import { riskWeights } from "./weights";

type ModuleFn = (ctx: ReturnType<typeof parseRiskContext>) => ModuleResult;

const moduleDefs: Array<{ name: keyof typeof riskWeights; fn: ModuleFn }> = [
  { name: "impersonation", fn: impersonationModule },
  { name: "domainAge", fn: domainAgeModule },
  { name: "lexicalSignals", fn: lexicalSignalsModule },
  { name: "entropy", fn: entropyModule },
  { name: "dnsSignals", fn: dnsSignalsModule },
  { name: "infrastructureSignals", fn: infrastructureSignalsModule },
  { name: "abuseHeuristics", fn: abuseHeuristicsModule },
  { name: "contentSignals", fn: contentSignalsModule }
];

export function evaluateDomainRisk(domain: string, options?: { contentFetchEnabled?: boolean }): FinalRiskResult {
  const ctx = parseRiskContext(domain, Boolean(options?.contentFetchEnabled));
  const runs: ModuleExecution[] = moduleDefs.map(({ name, fn }) => {
    const result = fn(ctx);
    const weight = riskWeights[name];
    const weightedScoreDelta = result.scoreDelta * weight;
    return { module: name, weight, weightedScoreDelta, result };
  });

  let score = runs.reduce((acc, run) => acc + run.weightedScoreDelta, 0);
  score = clampScore(score);

  const riskFactors = Array.from(new Set(runs.flatMap((r) => r.result.riskFactors)));
  const abuseSignals = Array.from(new Set(runs.flatMap((r) => r.result.abuseSignals)));
  const impersonationRaw = runs.find((r) => r.module === "impersonation")?.result.scoreDelta || 0;
  const ageRaw = runs.find((r) => r.module === "domainAge")?.result.scoreDelta || 0;

  let riskLevel = getRiskLevel(score);
  if (impersonationRaw >= 45 && (riskLevel === "LOW" || riskLevel === "MEDIUM")) {
    riskLevel = "HIGH";
  }
  if (impersonationRaw >= 45 && ageRaw >= 15) {
    riskLevel = "CRITICAL";
  }

  let confidence = 0.2 + runs.reduce((acc, run) => acc + run.result.confidenceDelta * run.weight, 0);
  const triggered = runs.filter((r) => r.result.scoreDelta > 0);
  if (triggered.length >= 3) confidence += 0.1;
  if (impersonationRaw >= 45 && ageRaw >= 15) confidence += 0.15;
  if (impersonationRaw >= 45 && (runs.find((r) => r.module === "dnsSignals")?.result.scoreDelta || 0) > 0) confidence += 0.08;
  if ((runs.find((r) => r.module === "entropy")?.result.scoreDelta || 0) >= 10 && ageRaw >= 8) confidence += 0.07;

  const noSuspiciousSignals = triggered.length === 0;
  const longEstablished = ageRaw < 0;
  if (noSuspiciousSignals && longEstablished && impersonationRaw === 0) {
    score = clampScore(score - 8);
    riskLevel = "LOW";
    confidence = Math.min(1, confidence + 0.08);
  }

  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));

  return {
    score,
    riskLevel,
    confidence,
    riskFactors,
    abuseSignals,
    technicalDetails: {
      modulesTriggered: triggered.map((r) => r.module),
      weightsUsed: { ...riskWeights },
      moduleBreakdown: runs.map((run) => ({
        module: run.module,
        scoreDelta: run.result.scoreDelta,
        weightedScoreDelta: Number(run.weightedScoreDelta.toFixed(2)),
        confidenceDelta: Number(run.result.confidenceDelta.toFixed(3))
      }))
    }
  };
}
