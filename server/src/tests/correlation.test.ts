import test from "node:test";
import assert from "node:assert/strict";
import { deriveDomainCorrelation, deriveIpCorrelation } from "../services/correlation";

test("deriveDomainCorrelation links domain to ips, keys and related domains", () => {
  const logs = [
    { domain: "evil.com", ipAddress: "1.1.1.1", apiKeyId: "k1", userId: "u1" },
    { domain: "evil.com", ipAddress: "2.2.2.2", apiKeyId: "k2", userId: "u2" },
    { domain: "another-evil.com", ipAddress: "1.1.1.1", apiKeyId: "k3", userId: "u3" },
    { domain: "shared.com", ipAddress: "9.9.9.9", apiKeyId: "k2", userId: "u9" }
  ];
  const out = deriveDomainCorrelation("evil.com", logs);
  assert.deepEqual(out.relatedIps.sort(), ["1.1.1.1", "2.2.2.2"]);
  assert.deepEqual(out.relatedKeys.sort(), ["k1", "k2"]);
  assert.equal(out.relatedDomains.includes("another-evil.com"), true);
  assert.equal(out.relatedDomains.includes("shared.com"), true);
});

test("deriveIpCorrelation links ip to domains, keys, users and overlap ips", () => {
  const logs = [
    { domain: "a.com", ipAddress: "3.3.3.3", apiKeyId: "k1", userId: "u1" },
    { domain: "b.com", ipAddress: "3.3.3.3", apiKeyId: "k2", userId: "u2" },
    { domain: "a.com", ipAddress: "4.4.4.4", apiKeyId: "k3", userId: "u3" },
    { domain: "z.com", ipAddress: "5.5.5.5", apiKeyId: "k2", userId: "u5" }
  ];
  const out = deriveIpCorrelation("3.3.3.3", logs);
  assert.equal(out.relatedDomains.includes("a.com"), true);
  assert.equal(out.relatedDomains.includes("b.com"), true);
  assert.equal(out.relatedKeys.includes("k1"), true);
  assert.equal(out.relatedKeys.includes("k2"), true);
  assert.equal(out.relatedIps.includes("4.4.4.4"), true);
  assert.equal(out.relatedIps.includes("5.5.5.5"), true);
});

