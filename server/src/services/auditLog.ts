import { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type AuditInput = {
  req: Request;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata: Record<string, unknown>;
};

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? req.ip ?? "0.0.0.0";
  return req.ip ?? "0.0.0.0";
}

export async function createAdminAuditLog(input: AuditInput) {
  const base = {
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ipAddress: getIp(input.req),
    userAgent: input.req.get("user-agent") ?? null,
    metadata: input.metadata as Prisma.InputJsonValue,
    correlationId: input.req.requestId
  };

  try {
    await prisma.adminAuditLog.create({
      data: {
        ...base,
        actorUserId: input.actorUserId ?? null
      }
    });
  } catch (error) {
    // Stale JWT/user references must never crash request handling.
    await prisma.adminAuditLog.create({
      data: {
        ...base,
        actorUserId: null,
        metadata: {
          ...(input.metadata || {}),
          actorUserIdRejected: input.actorUserId ?? null,
          actorUserIdFallbackApplied: true
        } as Prisma.InputJsonValue
      }
    });
    if (process.env.NODE_ENV !== "production") {
      console.warn("Admin audit actor fallback applied", error);
    }
  }
}
