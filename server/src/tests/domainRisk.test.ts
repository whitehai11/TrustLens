import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDomain } from "../services/domainRisk";

test("rnicrosoft.com => HIGH or CRITICAL with impersonation factor", () => {
  const result = analyzeDomain("rnicrosoft.com");
  assert.equal(["HIGH", "CRITICAL"].includes(result.riskLevel), true);
  assert.equal(result.riskFactors.some((x) => /impersonation|brand-typo|typosquatting/i.test(x)), true);
});

test("microsoft-support-login.xyz => CRITICAL", () => {
  const result = analyzeDomain("microsoft-support-login.xyz");
  assert.equal(result.riskLevel, "CRITICAL");
  assert.equal(result.score >= 75, true);
});

test("g00gle-secure-verification.com => HIGH", () => {
  const result = analyzeDomain("g00gle-secure-verification.com");
  assert.equal(["HIGH", "CRITICAL"].includes(result.riskLevel), true);
  assert.equal(result.abuseSignals.some((x) => /confusable|suspicious/i.test(x)), true);
});

test("paypal.com => LOW", () => {
  const result = analyzeDomain("paypal.com");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.score <= 24, true);
});

test("random-crypto-airdrop-verify.xyz => HIGH", () => {
  const result = analyzeDomain("random-crypto-airdrop-verify.xyz");
  assert.equal(["HIGH", "CRITICAL"].includes(result.riskLevel), true);
});

test("github.com => LOW", () => {
  const result = analyzeDomain("github.com");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.score <= 24, true);
});

test("response includes explainability technicalDetails", () => {
  const result = analyzeDomain("rnicrosoft.com");
  assert.equal(Array.isArray(result.technicalDetails.modulesTriggered), true);
  assert.equal(typeof result.technicalDetails.weightsUsed, "object");
  assert.equal(Array.isArray(result.technicalDetails.moduleBreakdown), true);
});

