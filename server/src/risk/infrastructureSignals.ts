import { ModuleResult, RiskContext } from "./core";

const riskyHostingHints = ["vps", "cheap", "hostfree", "freehost", "temp", "cdnlogin"];
const locallyFlaggedAsnHints = ["as14061", "as13335", "as9009", "as16276"];

export function infrastructureSignalsModule(ctx: RiskContext): ModuleResult {
  const riskFactors: string[] = [];
  const abuseSignals: string[] = [];
  let scoreDelta = 0;
  let confidenceDelta = 0;

  if (riskyHostingHints.some((hint) => ctx.fqdn.includes(hint))) {
    scoreDelta += 10;
    confidenceDelta += 0.09;
    riskFactors.push("Infrastructure naming suggests disposable hosting");
  }

  if (locallyFlaggedAsnHints.some((hint) => ctx.fqdn.includes(hint))) {
    scoreDelta += 12;
    confidenceDelta += 0.1;
    abuseSignals.push("Local flagged ASN hint in infrastructure identifier");
  }

  if (ctx.hasSuspiciousTld && ctx.sld.length > 18) {
    scoreDelta += 6;
    confidenceDelta += 0.05;
    abuseSignals.push("Long label on abuse-prone TLD increases infrastructure risk");
  }

  return { scoreDelta, riskFactors, abuseSignals, confidenceDelta };
}

