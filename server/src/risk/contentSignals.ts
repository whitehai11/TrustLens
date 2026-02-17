import { ModuleResult, RiskContext } from "./core";

export function contentSignalsModule(ctx: RiskContext): ModuleResult {
  if (!ctx.contentFetchEnabled) {
    return { scoreDelta: 0, riskFactors: [], abuseSignals: [], confidenceDelta: 0 };
  }

  // Content-fetch mode is disabled by default to keep the engine fast and pure.
  // Future extension point: inject fetched HTML snapshot and run form/title heuristics.
  return { scoreDelta: 0, riskFactors: [], abuseSignals: [], confidenceDelta: 0 };
}

