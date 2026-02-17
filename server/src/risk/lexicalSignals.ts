import protectedBrands from "../data/protectedBrands.json";
import { ModuleResult, RiskContext } from "./core";
import { phishingSuffixes } from "./weights";

type BrandEntry = { canonicalDomain: string; tokens: string[] };

export function lexicalSignalsModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  const hyphenCount = (ctx.sld.match(/-/g) || []).length;
  if (hyphenCount >= 2) {
    scoreDelta += 8;
    confidenceDelta += 0.08;
    riskFactors.push("Excessive hyphen usage in second-level domain");
  }

  const numericRuns = ctx.sld.match(/\d{3,}/g) || [];
  if (numericRuns.length > 0) {
    scoreDelta += 8;
    confidenceDelta += 0.07;
    abuseSignals.push("Long numeric segments in domain label");
  }

  if (ctx.hasSuspiciousTld) {
    scoreDelta += 8;
    confidenceDelta += 0.08;
    abuseSignals.push(`Suspicious TLD .${ctx.tld}`);
  }

  const brands = protectedBrands as BrandEntry[];
  const sldClean = ctx.skeleton.replace(/-/g, "");
  const hasBrand = brands.some((brand) => brand.tokens.some((token) => sldClean.includes(token.replace(/\s+/g, "").toLowerCase())));
  const hasPhishingTerm = phishingSuffixes.some((suffix) => sldClean.includes(suffix));

  if (hasBrand && hasPhishingTerm) {
    scoreDelta += 14;
    confidenceDelta += 0.14;
    riskFactors.push("Brand token combined with authentication/lure keyword");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

