export default function DisclaimerPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <article className="rounded-3xl bg-white/95 p-8 shadow-soft">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Disclaimer</h1>

        <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
{`--------------------------------------------------------
Risk Evaluation Notice

The risk scores, reputation ratings, confidence indices, and abuse signals provided by TrustLens Project are generated using automated analytical models, heuristic evaluations, statistical analysis, and moderated community feedback.

These assessments are informational in nature and do not constitute factual determinations, legal conclusions, or accusations of wrongdoing.

A high or critical risk rating does not necessarily indicate malicious intent. Likewise, a low risk rating does not guarantee safety.

Users are solely responsible for conducting independent due diligence before making decisions based on this information.

--------------------------------------------------------
No Professional Advice

TrustLens Project does not provide legal, financial, cybersecurity, compliance, or professional advisory services.

All information is provided for research and educational purposes only.

Any actions taken based on this information are at the sole discretion and responsibility of the user.

--------------------------------------------------------
Community Content Disclaimer

Community reports and feedback are submitted by users and subject to moderation processes.

TrustLens Project does not guarantee the completeness, accuracy, or reliability of user-submitted content.

Domain owners may request review, clarification, or dispute resolution through the official dispute system.

--------------------------------------------------------
Verified Ownership Notice

Verification of domain ownership confirms control over a domain via technical validation methods.

Verification does not imply endorsement, security certification, or trustworthiness.

Risk assessments remain independent of ownership verification status.
--------------------------------------------------------`}
        </pre>
      </article>
    </main>
  );
}
