import test from "node:test";
import assert from "node:assert/strict";
import {
  dnsRecordsContainToken,
  httpBodyContainsToken,
  isChallengeExpired,
  verificationTxtValue
} from "../services/domainVerification";

test("successful DNS verification token match", () => {
  const token = "abcdefghijklmnopqrstuvwxyz123456";
  const records = [["v=spf1 include:_spf.example.com ~all"], [verificationTxtValue(token)]];
  assert.equal(dnsRecordsContainToken(records, token), true);
});

test("expired challenge is detected", () => {
  const expiresAt = new Date(Date.now() - 1_000);
  assert.equal(isChallengeExpired(expiresAt), true);
});

test("wrong token does not validate for DNS/HTTP", () => {
  const token = "abcdefghijklmnopqrstuvwxyz123456";
  const records = [[verificationTxtValue("different-token-value-1234567890")]];
  assert.equal(dnsRecordsContainToken(records, token), false);

  const body = `${verificationTxtValue("different-token-value-1234567890")}\nother-line`;
  assert.equal(httpBodyContainsToken(body, token), false);
});
