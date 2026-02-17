import test from "node:test";
import assert from "node:assert/strict";
import { getApiKeyParts, maskApiKey, maskApiKeyFromParts } from "../lib/security";

test("maskApiKey only reveals prefix and last4", () => {
  const key = "tlp_abcdefghijklmnopqrstuvwxyz1234";
  const masked = maskApiKey(key);
  assert.equal(masked.startsWith("tlp_ab"), true);
  assert.equal(masked.endsWith("1234"), true);
  assert.equal(masked.includes("cdefghijklmnopqrstuvwxyz"), false);
});

test("maskApiKeyFromParts uses stored parts", () => {
  const parts = getApiKeyParts("tlp_abcdefghijk9876");
  assert.equal(maskApiKeyFromParts(parts.prefix, parts.last4), `${parts.prefix}...${parts.last4}`);
});

