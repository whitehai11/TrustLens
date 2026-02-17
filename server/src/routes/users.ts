import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { maskApiKeyFromParts } from "../lib/security";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.id },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      apiKeys: {
        select: { id: true, tier: true, status: true, dailyLimit: true, prefix: true, last4: true, createdAt: true, lastUsedAt: true }
      }
    }
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({
    ...user,
    apiKeys: user.apiKeys.map((k) => ({
      id: k.id,
      tier: k.tier,
      status: k.status,
      dailyLimit: k.dailyLimit,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      keyMasked: maskApiKeyFromParts(k.prefix, k.last4)
    }))
  });
});

router.get("/usage", requireAuth, async (req, res) => {
  const data = await prisma.$queryRaw<Array<{ day: Date; total: bigint }>>`
    SELECT DATE(u."createdAt") AS day, COUNT(*)::bigint AS total
    FROM "ApiRequestLog" u
    JOIN "ApiKey" a ON a.id = u."apiKeyId"
    WHERE a."userId" = ${req.authUser!.id} AND u."createdAt" >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(u."createdAt")
    ORDER BY day ASC
  `;

  return res.json(data.map((row) => ({ day: row.day, total: Number(row.total) })));
});

export default router;
