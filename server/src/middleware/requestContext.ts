import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

export function attachRequestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.locals.startedAt = startedAt;
  res.setHeader("X-Request-Id", requestId);
  next();
}

