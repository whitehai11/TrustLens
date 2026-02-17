import test from "node:test";
import assert from "node:assert/strict";
import { __resetMlAnomalyStoreForTests, ingestRequestForAnomaly, runMlAnomalyDetection } from "../services/mlAnomaly";

test("EWMA/Z detector flags strong request spike for API key", () => {
  __resetMlAnomalyStoreForTests();
  const base = Date.now() - 20 * 60_000;
  const key = "key_spike_1";
  const ip = "10.0.0.2";

  for (let minute = 0; minute < 8; minute++) {
    const tick = base + minute * 60_000;
    for (let i = 0; i < 12; i++) {
      ingestRequestForAnomaly({
        ts: tick + i * 1_000,
        apiKeyId: key,
        ipAddress: ip,
        endpoint: "/api/domain/check",
        domain: `normal-${i % 3}.com`,
        statusCode: 200,
        durationMs: 40
      });
    }
    runMlAnomalyDetection(tick + 59_000);
  }

  const spikeTick = base + 9 * 60_000;
  for (let i = 0; i < 180; i++) {
    ingestRequestForAnomaly({
      ts: spikeTick + (i % 60) * 200,
      apiKeyId: key,
      ipAddress: ip,
      endpoint: "/api/domain/check",
      domain: `scan-${i}.xyz`,
      statusCode: 200,
      durationMs: 35
    });
  }

  const out = runMlAnomalyDetection(spikeTick + 59_000);
  const spike = out.find((d) => d.entityType === "API_KEY" && String(d.kind) === "ML_ANOMALY_SPIKE");
  assert.ok(spike);
  assert.equal(["LOW", "MEDIUM", "HIGH"].includes(spike!.severity), true);
  assert.equal((spike!.details.features.requests_per_minute || 0) >= 120, true);
});
