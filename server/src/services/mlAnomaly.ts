import { AbuseKind, AbuseSeverity } from "@prisma/client";

type Observation = {
  ts: number;
  apiKeyId?: string | null;
  ipAddress: string;
  endpoint: string;
  domain?: string | null;
  statusCode: number;
  durationMs: number;
};

type EntityType = "IP" | "API_KEY";

type MetricName =
  | "requests_per_minute"
  | "unique_domains_per_5m"
  | "error_rate_5m"
  | "avg_duration_ms_5m"
  | "entropy_of_domains_10m"
  | "endpoint_mix";

type Features = Record<MetricName, number>;

type EwmaMetric = {
  mean: number;
  variance: number;
  updates: number;
};

type EntityState = {
  observations: Observation[];
  baselines: Record<MetricName, EwmaMetric>;
};

export type MlDetection = {
  kind: AbuseKind;
  severity: AbuseSeverity;
  entityType: EntityType;
  entityId: string;
  apiKeyId?: string;
  ipAddress?: string;
  details: {
    z: Partial<Record<MetricName, number>>;
    features: Features;
    window: { oneMinuteMs: number; fiveMinutesMs: number; tenMinutesMs: number };
    thresholds: { spike: number; errorShift: number; enumeration: number };
  };
};

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * 60_000;
const TEN_MINUTES_MS = 10 * 60_000;
const ALPHA = 0.25;
const MIN_UPDATES = 5;
const EPSILON = 1e-5;
const FLAG_COOLDOWN_MS = 10 * 60_000;
const SPIKE_THRESHOLD = 4.0;
const ERROR_SHIFT_THRESHOLD = 4.0;
const ENUM_THRESHOLD = 3.5;

const entityStore = new Map<string, EntityState>();
const lastFlagAt = new Map<string, number>();

const metricNames: MetricName[] = [
  "requests_per_minute",
  "unique_domains_per_5m",
  "error_rate_5m",
  "avg_duration_ms_5m",
  "entropy_of_domains_10m",
  "endpoint_mix"
];

function metricSeed(): EwmaMetric {
  return { mean: 0, variance: 1, updates: 0 };
}

function createEntityState(): EntityState {
  return {
    observations: [],
    baselines: {
      requests_per_minute: metricSeed(),
      unique_domains_per_5m: metricSeed(),
      error_rate_5m: metricSeed(),
      avg_duration_ms_5m: metricSeed(),
      entropy_of_domains_10m: metricSeed(),
      endpoint_mix: metricSeed()
    }
  };
}

function entityKey(entityType: EntityType, id: string): string {
  return `${entityType}:${id}`;
}

function prune(state: EntityState, now: number) {
  state.observations = state.observations.filter((obs) => now - obs.ts <= TEN_MINUTES_MS);
}

function shannonEntropy(items: string[]): number {
  if (!items.length) return 0;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / items.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function domainTokenEntropy(domains: string[]): number {
  const tokens = domains.map((domain) => domain.split(".")[0] || domain);
  if (!tokens.length) return 0;
  const all = tokens.join("");
  const chars = all.split("");
  return shannonEntropy(chars);
}

function featuresFor(state: EntityState, now: number): Features {
  prune(state, now);
  const recent1m = state.observations.filter((obs) => now - obs.ts <= ONE_MINUTE_MS);
  const recent5m = state.observations.filter((obs) => now - obs.ts <= FIVE_MINUTES_MS);
  const recent10m = state.observations;

  const uniqueDomains5m = new Set(recent5m.map((obs) => obs.domain).filter(Boolean)).size;
  const errors5m = recent5m.filter((obs) => obs.statusCode >= 400).length;
  const avgDuration5m = recent5m.length ? recent5m.reduce((sum, obs) => sum + obs.durationMs, 0) / recent5m.length : 0;
  const domains10m = recent10m.map((obs) => obs.domain).filter((value): value is string => Boolean(value));
  const endpointEntropy5m = shannonEntropy(recent5m.map((obs) => obs.endpoint));

  return {
    requests_per_minute: recent1m.length,
    unique_domains_per_5m: uniqueDomains5m,
    error_rate_5m: recent5m.length ? errors5m / recent5m.length : 0,
    avg_duration_ms_5m: avgDuration5m,
    entropy_of_domains_10m: domainTokenEntropy(domains10m),
    endpoint_mix: endpointEntropy5m
  };
}

function zScore(metric: EwmaMetric, value: number): number {
  const std = Math.sqrt(Math.max(metric.variance, EPSILON));
  return (value - metric.mean) / std;
}

function updateBaseline(metric: EwmaMetric, value: number) {
  if (metric.updates === 0) {
    metric.mean = value;
    metric.variance = 1;
    metric.updates = 1;
    return;
  }
  const nextMean = ALPHA * value + (1 - ALPHA) * metric.mean;
  const diff = value - metric.mean;
  metric.variance = Math.max(EPSILON, ALPHA * diff * diff + (1 - ALPHA) * metric.variance);
  metric.mean = nextMean;
  metric.updates += 1;
}

function toSeverity(z: number): AbuseSeverity {
  if (z >= 8) return AbuseSeverity.HIGH;
  if (z >= 5) return AbuseSeverity.MEDIUM;
  return AbuseSeverity.LOW;
}

function canEmit(kind: AbuseKind, entityType: EntityType, id: string, now: number): boolean {
  const key = `${kind}:${entityType}:${id}`;
  const previous = lastFlagAt.get(key);
  if (previous && now - previous < FLAG_COOLDOWN_MS) return false;
  lastFlagAt.set(key, now);
  return true;
}

function detectForEntity(entityType: EntityType, id: string, state: EntityState, now: number): MlDetection[] {
  const features = featuresFor(state, now);
  const z: Partial<Record<MetricName, number>> = {};
  const detections: MlDetection[] = [];

  for (const metricName of metricNames) {
    const metric = state.baselines[metricName];
    if (metric.updates >= MIN_UPDATES) {
      z[metricName] = zScore(metric, features[metricName]);
    }
  }

  const zReq = z.requests_per_minute ?? 0;
  const zDomains = z.unique_domains_per_5m ?? 0;
  const zError = z.error_rate_5m ?? 0;
  const zEntropy = z.entropy_of_domains_10m ?? 0;
  const zEndpointMix = z.endpoint_mix ?? 0;

  if ((zReq >= SPIKE_THRESHOLD || zDomains >= SPIKE_THRESHOLD) && canEmit(ML_ANOMALY_SPIKE, entityType, id, now)) {
    const maxZ = Math.max(zReq, zDomains);
    detections.push({
      kind: ML_ANOMALY_SPIKE,
      severity: toSeverity(maxZ),
      entityType,
      entityId: id,
      apiKeyId: entityType === "API_KEY" ? id : undefined,
      ipAddress: entityType === "IP" ? id : undefined,
      details: {
        z,
        features,
        window: { oneMinuteMs: ONE_MINUTE_MS, fiveMinutesMs: FIVE_MINUTES_MS, tenMinutesMs: TEN_MINUTES_MS },
        thresholds: { spike: SPIKE_THRESHOLD, errorShift: ERROR_SHIFT_THRESHOLD, enumeration: ENUM_THRESHOLD }
      }
    });
  }

  if (zError >= ERROR_SHIFT_THRESHOLD && features.error_rate_5m >= 0.3 && canEmit(ML_ERROR_SHIFT, entityType, id, now)) {
    detections.push({
      kind: ML_ERROR_SHIFT,
      severity: toSeverity(zError),
      entityType,
      entityId: id,
      apiKeyId: entityType === "API_KEY" ? id : undefined,
      ipAddress: entityType === "IP" ? id : undefined,
      details: {
        z,
        features,
        window: { oneMinuteMs: ONE_MINUTE_MS, fiveMinutesMs: FIVE_MINUTES_MS, tenMinutesMs: TEN_MINUTES_MS },
        thresholds: { spike: SPIKE_THRESHOLD, errorShift: ERROR_SHIFT_THRESHOLD, enumeration: ENUM_THRESHOLD }
      }
    });
  }

  const isEnumeration = zDomains >= ENUM_THRESHOLD && (zEntropy >= ENUM_THRESHOLD || zEndpointMix >= ENUM_THRESHOLD) && features.unique_domains_per_5m >= 15;
  if (isEnumeration && canEmit(ML_ENUMERATION, entityType, id, now)) {
    detections.push({
      kind: ML_ENUMERATION,
      severity: toSeverity(Math.max(zDomains, zEntropy, zEndpointMix)),
      entityType,
      entityId: id,
      apiKeyId: entityType === "API_KEY" ? id : undefined,
      ipAddress: entityType === "IP" ? id : undefined,
      details: {
        z,
        features,
        window: { oneMinuteMs: ONE_MINUTE_MS, fiveMinutesMs: FIVE_MINUTES_MS, tenMinutesMs: TEN_MINUTES_MS },
        thresholds: { spike: SPIKE_THRESHOLD, errorShift: ERROR_SHIFT_THRESHOLD, enumeration: ENUM_THRESHOLD }
      }
    });
  }

  for (const metricName of metricNames) {
    updateBaseline(state.baselines[metricName], features[metricName]);
  }
  return detections;
}

function ingestForEntity(entityType: EntityType, id: string, obs: Observation) {
  const key = entityKey(entityType, id);
  const state = entityStore.get(key) || createEntityState();
  state.observations.push(obs);
  prune(state, obs.ts);
  entityStore.set(key, state);
}

export function ingestRequestForAnomaly(input: Observation) {
  ingestForEntity("IP", input.ipAddress, input);
  if (input.apiKeyId) {
    ingestForEntity("API_KEY", input.apiKeyId, input);
  }
}

export function runMlAnomalyDetection(now = Date.now()): MlDetection[] {
  const out: MlDetection[] = [];
  for (const [key, state] of entityStore.entries()) {
    const [entityTypeRaw, entityId] = key.split(":");
    const entityType = entityTypeRaw === "API_KEY" ? "API_KEY" : "IP";
    const detections = detectForEntity(entityType, entityId, state, now);
    out.push(...detections);
  }
  return out;
}

export function __resetMlAnomalyStoreForTests() {
  entityStore.clear();
  lastFlagAt.clear();
}
const ML_ANOMALY_SPIKE = "ML_ANOMALY_SPIKE" as AbuseKind;
const ML_ENUMERATION = "ML_ENUMERATION" as AbuseKind;
const ML_ERROR_SHIFT = "ML_ERROR_SHIFT" as AbuseKind;
