export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
};

function buildArticle(topic: string, threatModel: string): string {
  return `
${topic} is not a single trick. It is a workflow that combines psychology, timing, and technical camouflage to move a target from curiosity to compliance. Most incidents begin with a believable story and a low-friction action, such as clicking a link, scanning a QR code, transferring a small amount of money, or sharing account details "just for verification." Attackers design this first step to feel normal. The risk accelerates only after trust is formed. That is why strong security programs train people to identify the early cues rather than waiting for a dramatic red flag.

The core problem in ${topic.toLowerCase()} is trust hijacking. Criminal operators borrow credibility from known brands, public events, social identity, and routine business processes. They understand how people make decisions under pressure. If a message looks official, references an urgent deadline, and offers a clear action button, many users follow it quickly. In enterprise settings, the same pattern appears when a fake vendor update, invoice reminder, or internal policy notice drives staff into entering credentials or approving payments. The attack is successful because it fits an expected narrative.

A practical defense starts with behavior baselining. Teams should define what legitimate communication looks like for payment requests, account recovery, customer support, recruitment, and promotions. Every channel needs policy: who can request money, which domain names are approved, what escalation path is required before account changes, and what independent verification method must happen for high-impact actions. Clear policy reduces ambiguity, and reduced ambiguity weakens social-engineering leverage.

Technical controls are the second layer. Domain monitoring, SPF and DKIM validation, anomaly detection for login behavior, and URL reputation scoring all reduce exposure. For consumer-facing products, anti-abuse controls should include rate limits, challenge responses, and telemetry around suspicious referral sources. For internal tools, conditional access and hardware-backed multi-factor authentication materially reduce account takeover rates. These controls do not eliminate risk, but they compress attacker opportunity windows and increase operational cost for threat actors.

In the ${threatModel} phase, victims often encounter signals that feel small in isolation: spelling drift in a sender address, copied legal text, mismatched support numbers, synthetic social profiles, and evasive answers when asked specific questions. TrustLens-style analysis helps by collecting many low-confidence indicators and synthesizing them into one interpretable score with confidence metadata. This is essential, because most users are not deciding between "perfectly safe" and "obvious scam." They are deciding under partial information with time pressure.

Incident response should be pre-planned. When a report is filed, teams need fast triage workflows that classify evidence, preserve logs, and assign ownership. Reports should map to repeatable categories so analysts can spot campaign clustering across domains, infrastructure providers, and message templates. Ticket systems should support visible status updates for reporters, because silence drives duplicate reports and lowers trust in the security process. Mature operations prioritize both speed and communication quality.

Education programs fail when they are generic or annual-only. Effective awareness content is role-specific and scenario-based. Finance staff need realistic invoice diversion simulations. Customer support needs account-recovery abuse scenarios. Executive teams need deepfake and impersonation threat drills. General consumers need concise guidance for payout pressure, fake urgency, and credential harvesting attempts. When people see how an attack works in their own workflow, retention and reporting quality improve immediately.

Metrics matter. Organizations should track time-to-detect, time-to-contain, false-positive rates, and reporter satisfaction. They should also monitor trend direction for abuse reports over 24 hours, 7 days, 30 days, and 1 year. Short-window spikes reveal active campaigns; long-window trends reveal program maturity. Data should inform both product changes and policy changes. If one abuse pattern keeps recurring, the platform should eliminate the enabling condition instead of relying only on user caution.

Recovery and remediation require transparency. Affected users deserve clear explanations of what happened, what data was exposed, what protective actions are now required, and how future incidents will be prevented. Internally, post-incident reviews should capture root causes across people, process, and technology. The best reviews do not stop at "user clicked a bad link." They document why the environment made that click easy, then harden the path.

The long-term strategy for ${topic.toLowerCase()} is layered trust engineering. Combine robust identity controls, fast abuse reporting, domain intelligence, strict operational policy, and sustained education. This approach recognizes that social engineering evolves continuously. Success comes from reducing exploitability over time, not from expecting perfect user behavior. When teams consistently apply layered controls and measure outcomes, they materially reduce loss, shorten incident lifecycles, and increase confidence for every stakeholder in the digital ecosystem.
`.trim();
}

const topics: Array<[string, string]> = [
  ["phishing", "credential-harvest"],
  ["investment scams", "high-return lure"],
  ["fake crypto platforms", "wallet-drain"],
  ["tech support scams", "remote-access coercion"],
  ["romance scams", "emotional manipulation"],
  ["marketplace fraud", "payment redirection"],
  ["impersonation scams", "identity spoofing"],
  ["job scams", "recruitment social engineering"],
  ["malware delivery domains", "payload staging"],
  ["clone websites", "brand mimicry"],
  ["smishing", "mobile social engineering"],
  ["email spoofing", "sender deception"],
  ["rug pulls", "liquidity extraction"],
  ["pump & dump", "market manipulation"],
  ["giveaway scams", "fake reward funnel"]
];

export const articles: Article[] = topics.map(([title, model]) => ({
  slug: title
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .toLowerCase(),
  title: title[0].toUpperCase() + title.slice(1),
  excerpt: `Deep guide to ${title} abuse patterns and practical prevention controls.`,
  content: buildArticle(title[0].toUpperCase() + title.slice(1), model)
}));

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}
