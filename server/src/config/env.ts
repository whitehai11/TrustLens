import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  cookieName: process.env.COOKIE_NAME || "trustlens_session",
  autoSuspendKeyOnHighAbuse: process.env.AUTO_SUSPEND_KEY_ON_HIGH_ABUSE === "true",
  autoBlockIpOnHighAbuse: process.env.AUTO_BLOCK_IP_ON_HIGH_ABUSE === "true",
  autoSuspendOnMlHigh: process.env.AUTO_SUSPEND_ON_ML_HIGH === "true",
  autoBlockIpOnMlExtreme: process.env.AUTO_BLOCK_IP_ON_ML_EXTREME === "true",
  enableMlIsolationForest: process.env.ENABLE_ML_ISOLATION_FOREST === "true",
  systemActorUserId: process.env.SYSTEM_ACTOR_USER_ID || "system",
  logRetentionDays: Number(process.env.LOG_RETENTION_DAYS || 90),
  intelRetentionDays: Number(process.env.INTEL_RETENTION_DAYS || 365)
};
