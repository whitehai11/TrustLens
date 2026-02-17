import { NextFunction, Request, Response } from "express";
import { IpRuleType } from "@prisma/client";
import { prisma } from "../lib/prisma";

function getIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() ?? req.ip ?? "0.0.0.0";
  return req.ip ?? "0.0.0.0";
}

export async function enforceIpRules(req: Request, res: Response, next: NextFunction) {
  const ip = getIp(req);
  const now = new Date();

  const rules = await prisma.ipRule.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    }
  });

  const matched = rules.filter((rule) => rule.value === ip);
  if (matched.some((r) => r.type === IpRuleType.BLOCK)) {
    return res.status(403).json({ error: "IP blocked", requestId: res.locals.requestId });
  }

  return next();
}
