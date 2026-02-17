import { ModuleResult, RiskContext } from "./core";

const paymentKeywords = ["pay", "payment", "invoice", "refund", "billing", "bank", "card"];
const cryptoKeywords = ["crypto", "wallet", "seed", "airdrop", "giveaway", "token", "recovery"];
const lureKeywords = ["bonus", "free", "claim", "urgent", "verify"];

export function abuseHeuristicsModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  const value = `${ctx.sld}.${ctx.tld}`;
  const hasPayment = paymentKeywords.some((k) => value.includes(k));
  const hasCrypto = cryptoKeywords.some((k) => value.includes(k));
  const hasLure = lureKeywords.some((k) => value.includes(k));

  if (hasPayment && hasLure) {
    scoreDelta += 10;
    confidenceDelta += 0.09;
    riskFactors.push("Payment-themed lure pattern");
  }

  if (hasCrypto) {
    scoreDelta += 10;
    confidenceDelta += 0.1;
    riskFactors.push("Crypto-wallet or token lure keyword set");
  }

  if (hasCrypto && hasLure) {
    scoreDelta += 8;
    confidenceDelta += 0.08;
    abuseSignals.push("Combined crypto + lure campaign pattern");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

