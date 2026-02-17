import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { Permission, rolePermissions } from "../constants/permissions";
import { createAdminAuditLog } from "../services/auditLog";

type JwtPayload = { sub: string; role: Role };

function readToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  const cookieToken = req.cookies?.[env.cookieName];
  return bearerToken || cookieToken;
}

function forbidden(res: Response, message: string) {
  return res.status(403).json({ error: message, requestId: res.locals.requestId });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.authUser = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Authentication required", requestId: res.locals.requestId });
    }
    if (!allowed.includes(req.authUser.role)) {
      void createAdminAuditLog({
        req,
        actorUserId: req.authUser.id,
        action: "ADMIN_ROUTE_FORBIDDEN",
        targetType: "ROUTE",
        targetId: req.path,
        metadata: { requiredRoles: allowed, actualRole: req.authUser.role }
      });
      return forbidden(res, "Insufficient role");
    }
    return next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Authentication required", requestId: res.locals.requestId });
    }
    const allowed = rolePermissions[req.authUser.role] ?? [];
    if (!allowed.includes(permission)) {
      void createAdminAuditLog({
        req,
        actorUserId: req.authUser.id,
        action: "ADMIN_PERMISSION_FORBIDDEN",
        targetType: "PERMISSION",
        targetId: permission,
        metadata: { role: req.authUser.role }
      });
      return forbidden(res, "Insufficient permission");
    }
    return next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || (req.authUser.role !== "ADMIN" && req.authUser.role !== "SUPERADMIN")) {
    return forbidden(res, "Admin access required");
  }
  return next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    void createAdminAuditLog({
      req,
      actorUserId: null,
      action: "ADMIN_AUTH_MISSING",
      targetType: "ROUTE",
      targetId: req.path,
      metadata: {}
    });
    return res.status(401).json({ error: "Authentication required", requestId: res.locals.requestId });
  }
  if (req.authUser.role === "USER") {
    void createAdminAuditLog({
      req,
      actorUserId: req.authUser.id,
      action: "ADMIN_ROUTE_FORBIDDEN",
      targetType: "ROUTE",
      targetId: req.path,
      metadata: { role: req.authUser.role }
    });
    return forbidden(res, "Staff access required");
  }
  return next();
}
