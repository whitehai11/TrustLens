import { Response, Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiPlan, ApiKeyStatus, Role, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { validate } from "../middleware/validate";
import { env } from "../config/env";
import { generateApiKey, getApiKeyParts, hashApiKey, maskApiKeyFromParts } from "../lib/security";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

function tokenForUser(id: string, role: Role) {
  return jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: "7d" });
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.post("/register", validate(registerSchema), async (req, res) => {
  const { email, password } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: Role.USER, status: UserStatus.ACTIVE }
  });

  const freeTier = await prisma.planLimit.findUnique({ where: { plan: ApiPlan.FREE } });
  const fullKey = generateApiKey();
  const { prefix, last4 } = getApiKeyParts(fullKey);
  const hash = await hashApiKey(fullKey);
  const apiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      tier: ApiPlan.FREE,
      status: ApiKeyStatus.ACTIVE,
      dailyLimit: freeTier?.requestsPerDay ?? 200,
      prefix,
      last4,
      hash
    }
  });

  const token = tokenForUser(user.id, user.role);
  setSessionCookie(res, token);
  return res.status(201).json({
    token,
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
    apiKey: {
      id: apiKey.id,
      tier: apiKey.tier,
      status: apiKey.status,
      key: fullKey,
      keyMasked: maskApiKeyFromParts(apiKey.prefix, apiKey.last4)
    }
  });
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { apiKeys: true } });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status !== UserStatus.ACTIVE) {
    return res.status(403).json({ error: "Account suspended" });
  }

  const token = tokenForUser(user.id, user.role);
  setSessionCookie(res, token);
  return res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, status: user.status },
    apiKeys: user.apiKeys.map((k) => ({
      id: k.id,
      tier: k.tier,
      status: k.status,
      dailyLimit: k.dailyLimit,
      keyMasked: maskApiKeyFromParts(k.prefix, k.last4)
    }))
  });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/"
  });
  return res.status(204).send();
});

export default router;
