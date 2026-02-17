export const riskWeights = {
  impersonation: 1.25,
  domainAge: 1.0,
  lexicalSignals: 1.0,
  entropy: 0.9,
  dnsSignals: 0.7,
  infrastructureSignals: 0.8,
  abuseHeuristics: 1.0,
  contentSignals: 1.1
} as const;

export const suspiciousTlds = [
  "top",
  "xyz",
  "click",
  "gq",
  "cf",
  "tk",
  "ml",
  "work",
  "live",
  "loan",
  "cfd",
  "rest",
  "shop"
];

export const phishingSuffixes = ["login", "secure", "verify", "support", "account", "auth", "update", "wallet"];

