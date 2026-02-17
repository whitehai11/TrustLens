import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { publish } from "./events";
import { recordRequestMetric } from "./liveMetrics";
import { maskApiKeyFromParts, maskEmail } from "../lib/security";
import { ingestRequestForAnomaly } from "./mlAnomaly";

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? req.ip ?? "0.0.0.0";
  return req.ip ?? "0.0.0.0";
}

export function queueApiRequestLog(req: Request, res: Response) {
  const startedAt = Number(res.locals.startedAt || Date.now());
  const durationMs = Date.now() - startedAt;
  const riskLevel = res.locals.riskLevel as string | undefined;
  const score = typeof res.locals.score === "number" ? (res.locals.score as number) : undefined;
  const domain = (req.body as { domain?: string })?.domain;

  const shouldLog =
    req.path.startsWith("/api/domain/check") ||
    req.path.startsWith("/api/domain/report") ||
    Boolean(req.apiKeyMeta?.id);

  if (!shouldLog) return;

  setImmediate(() => {
    void prisma.apiRequestLog
      .create({
        data: {
          apiKeyId: req.apiKeyMeta?.id,
          userId: req.authUser?.id,
          endpoint: req.path,
          method: req.method,
          domain,
          ipAddress: getIp(req),
          userAgent: req.get("user-agent") ?? null,
          statusCode: res.statusCode,
          durationMs,
          riskLevel,
          score,
          correlationId: req.requestId
        }
      })
      .then((created) => {
        const enrich = async () => {
          const [key, user] = await Promise.all([
            created.apiKeyId
              ? prisma.apiKey.findUnique({ where: { id: created.apiKeyId }, select: { prefix: true, last4: true } })
              : Promise.resolve(null),
            created.userId ? prisma.user.findUnique({ where: { id: created.userId }, select: { email: true } }) : Promise.resolve(null)
          ]);
          return {
            maskedKey: key ? maskApiKeyFromParts(key.prefix, key.last4) : null,
            maskedUser: user ? maskEmail(user.email) : null
          };
        };

        void prisma.ipActivity.create({
          data: {
            ipAddress: created.ipAddress,
            domain: created.domain,
            apiKeyId: created.apiKeyId,
            userId: created.userId,
            endpoint: created.endpoint,
            statusCode: created.statusCode,
            correlationId: created.correlationId
          }
        });
        void enrich().then((extra) => {
          publish({
            type: "LOG_CREATED",
            correlationId: req.requestId,
            payload: {
              logId: created.id,
              apiKeyId: created.apiKeyId,
              userId: created.userId,
              maskedKey: extra.maskedKey,
              maskedUser: extra.maskedUser,
              endpoint: created.endpoint,
              method: created.method,
              domain: created.domain,
              ipAddress: created.ipAddress,
              statusCode: created.statusCode,
              durationMs: created.durationMs,
              riskLevel: created.riskLevel,
              score: created.score
            }
          });
        });
        recordRequestMetric({
          ipAddress: created.ipAddress,
          domain: created.domain,
          statusCode: created.statusCode
        });
        ingestRequestForAnomaly({
          ts: created.createdAt.getTime(),
          apiKeyId: created.apiKeyId,
          ipAddress: created.ipAddress,
          endpoint: created.endpoint,
          domain: created.domain,
          statusCode: created.statusCode,
          durationMs: created.durationMs
        });
      })
      .catch((err) => {
        console.error("request log write failed", {
          requestId: req.requestId,
          message: err instanceof Error ? err.message : String(err)
        });
      });
  });
}
