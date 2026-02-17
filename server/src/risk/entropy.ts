import { ModuleResult, RiskContext } from "./core";

function shannonEntropy(input: string) {
  if (!input.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of input) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  freq.forEach((count) => {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  });
  return entropy;
}

export function entropyModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  const compact = ctx.sld.replace(/-/g, "");
  const entropy = shannonEntropy(compact);
  const randomLike = /^[a-z0-9]{12,}$/.test(compact) && /\d/.test(compact) && /[a-z]/.test(compact);
  const consonantHeavy = /[bcdfghjklmnpqrstvwxyz]{5,}/.test(compact);

  if (entropy >= 3.6 && compact.length >= 10) {
    scoreDelta += 15;
    confidenceDelta += 0.15;
    riskFactors.push(`High lexical entropy detected (${entropy.toFixed(2)})`);
  }
  if (randomLike) {
    scoreDelta += 10;
    confidenceDelta += 0.08;
    abuseSignals.push("Random-like long alphanumeric SLD");
  }
  if (consonantHeavy && compact.length >= 9) {
    scoreDelta += 6;
    confidenceDelta += 0.05;
    abuseSignals.push("Consonant-cluster randomness in SLD");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

