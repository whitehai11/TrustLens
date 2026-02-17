import { NextFunction, Request, Response } from "express";
import { ApiKeyStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getApiKeyParts, verifyApiKey } from "../lib/security";

function dayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.header("x-api-key");
  const key = rawKey?.trim();
  if (!key) {
    return res.status(401).json({ error: "Missing x-api-key header" });
  }

  const { prefix, last4 } = getApiKeyParts(key);
  const candidates = await prisma.apiKey.findMany({
    where: { prefix, last4, status: ApiKeyStatus.ACTIVE },
    take: 5
  });

  const apiKey = (await Promise.all(candidates.map(async (candidate) => (await verifyApiKey(key, candidate.hash) ? candidate : null)))).find(Boolean);
  if (!apiKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  const todayUsage = await prisma.apiRequestLog.count({
    where: {
      apiKeyId: apiKey.id,
      createdAt: { gte: dayStart() }
    }
  });

  if (todayUsage >= apiKey.dailyLimit) {
    return res.status(429).json({ error: "Daily API limit reached" });
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  req.apiKeyMeta = { id: apiKey.id, tier: apiKey.tier };
  return next();
}

export async function attachApiKeyIfPresent(req: Request, _res: Response, next: NextFunction) {
  const rawKey = req.header("x-api-key");
  const key = rawKey?.trim();
  if (!key) return next();

  const { prefix, last4 } = getApiKeyParts(key);
  const candidates = await prisma.apiKey.findMany({
    where: { prefix, last4, status: ApiKeyStatus.ACTIVE },
    take: 5
  });
  const apiKey = (await Promise.all(candidates.map(async (candidate) => (await verifyApiKey(key, candidate.hash) ? candidate : null)))).find(Boolean);
  if (!apiKey) return next();

  const todayUsage = await prisma.apiRequestLog.count({
    where: {
      apiKeyId: apiKey.id,
      createdAt: { gte: dayStart() }
    }
  });

  if (todayUsage < apiKey.dailyLimit) {
    req.apiKeyMeta = { id: apiKey.id, tier: apiKey.tier };
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });
  }
  return next();
}

export async function logUsage(req: Request, statusCode: number) {
  if (!req.apiKeyMeta) return;
  await prisma.apiRequestLog.create({
    data: {
      apiKeyId: req.apiKeyMeta.id,
      endpoint: req.path,
      method: req.method,
      ipAddress: req.ip ?? "0.0.0.0",
      statusCode,
      durationMs: 0
    }
  });
}
