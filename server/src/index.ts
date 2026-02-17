import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { startAbuseDetector, stopAbuseDetector } from "./services/abuseDetection";
import { startRetentionJob, stopRetentionJob } from "./services/retention";

const server = app.listen(env.port, () => {
  console.log(`TrustLens server running on http://localhost:${env.port}`);
  startAbuseDetector();
  startRetentionJob();
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  stopAbuseDetector();
  stopRetentionJob();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
