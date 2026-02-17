import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";

export function readAuthIfPresent(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  const cookieToken = req.cookies?.[env.cookieName];
  const token = bearerToken || cookieToken;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; role: Role };
    req.authUser = { id: payload.sub, role: payload.role };
  } catch {
    if (bearerToken) {
      return res.status(401).json({ error: "Invalid or expired bearer token" });
    }
  }
  return next();
}
