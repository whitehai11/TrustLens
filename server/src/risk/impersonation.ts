import protectedBrands from "../data/protectedBrands.json";
import { RiskContext, ModuleResult } from "./core";
import { phishingSuffixes } from "./weights";

type BrandEntry = { canonicalDomain: string; tokens: string[] };

function damerauLevenshtein(a: string, b: string): number {
  const da = new Map<string, number>();
  const maxDist = a.length + b.length;
  const d: number[][] = Array.from({ length: a.length + 2 }, () => Array(b.length + 2).fill(0));
  d[0][0] = maxDist;
  for (let i = 0; i <= a.length; i++) {
    d[i + 1][0] = maxDist;
    d[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j + 1] = maxDist;
    d[1][j + 1] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    let db = 0;
    for (let j = 1; j <= b.length; j++) {
      const i1 = da.get(b[j - 1]) ?? 0;
      const j1 = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        db = j;
      }
      d[i + 1][j + 1] = Math.min(d[i][j] + cost, d[i + 1][j] + 1, d[i][j + 1] + 1, d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1));
    }
    da.set(a[i - 1], i);
  }
  return d[a.length + 1][b.length + 1];
}

function cleanToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeSuffixTrick(label: string, token: string) {
  return new RegExp(`^${token}[-]?(login|secure|verify|support|account|auth|update|wallet)$`).test(label);
}

export function impersonationModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  if (ctx.sld.includes("rn")) abuseSignals.push("Visual confusable pattern rn->m");
  if (ctx.sld.includes("vv")) abuseSignals.push("Visual confusable pattern vv->w");
  if (/[01]/.test(ctx.sld)) abuseSignals.push("Visual confusable alphanumeric substitution detected");

  const brands = protectedBrands as BrandEntry[];
  const isCanonicalBrandDomain = brands.some(
    (brand) => ctx.asciiDomain === brand.canonicalDomain.toLowerCase() || ctx.asciiDomain.endsWith(`.${brand.canonicalDomain.toLowerCase()}`)
  );
  if (isCanonicalBrandDomain) {
    return { scoreDelta: 0, riskFactors, abuseSignals, confidenceDelta };
  }
  const compactSld = cleanToken(ctx.sld);
  const compactVariants = ctx.confusableVariants.map((v) => cleanToken(v));
  for (const brand of brands) {
    const canonical = brand.canonicalDomain.toLowerCase();
    if (ctx.asciiDomain === canonical || ctx.asciiDomain.endsWith(`.${canonical}`)) continue;

    for (const tokenRaw of brand.tokens) {
      const token = cleanToken(tokenRaw);
      if (token.length < 3) continue;
      const exact = ctx.confusableVariants.some((v) => cleanToken(v) === token);
      if (exact) {
        scoreDelta = Math.max(scoreDelta, 58);
        confidenceDelta = Math.max(confidenceDelta, 0.28);
        riskFactors.push(`Brand impersonation / typosquatting detected: ${ctx.sld} ~ ${token}`);
        continue;
      }

      const minDistance = ctx.confusableVariants.reduce((acc, variant) => {
        return Math.min(acc, damerauLevenshtein(cleanToken(variant), token));
      }, 99);
      if (minDistance <= 2) {
        scoreDelta = Math.max(scoreDelta, minDistance <= 1 ? 52 : 46);
        confidenceDelta = Math.max(confidenceDelta, minDistance <= 1 ? 0.24 : 0.2);
        riskFactors.push(`Brand-typo proximity detected: ${ctx.sld} ~ ${token} (distance ${minDistance})`);
        continue;
      }

      if (looksLikeSuffixTrick(cleanToken(ctx.skeleton), token)) {
        scoreDelta = Math.max(scoreDelta, 45);
        confidenceDelta = Math.max(confidenceDelta, 0.16);
        riskFactors.push(`Brand phishing pattern detected: ${ctx.sld} uses ${token} with phishing suffix`);
      }

      const containsToken = compactVariants.some((v) => v.includes(token));
      const hasSuffixLure = phishingSuffixes.some((suffix) => compactSld.includes(suffix));
      if (containsToken && hasSuffixLure) {
        scoreDelta = Math.max(scoreDelta, 50);
        confidenceDelta = Math.max(confidenceDelta, 0.22);
        riskFactors.push(`Brand token with phishing suffix chain detected: ${ctx.sld} contains ${token}`);
      }

      if (compactVariants.some((v) => v.startsWith(token)) && hasSuffixLure) {
        scoreDelta = Math.max(scoreDelta, 55);
        confidenceDelta = Math.max(confidenceDelta, 0.25);
      }
    }
  }

  return {
    scoreDelta: Math.min(60, scoreDelta),
    riskFactors: Array.from(new Set(riskFactors)).slice(0, 5),
    abuseSignals: Array.from(new Set(abuseSignals)).slice(0, 6),
    confidenceDelta
  };
}
