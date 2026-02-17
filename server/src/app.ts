import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import compression from "compression";
import { env } from "./config/env";
import { attachRequestContext } from "./middleware/requestContext";
import authRoutes from "./routes/auth";
import domainRoutes from "./routes/domain";
import reportRoutes from "./routes/reports";
import ticketRoutes from "./routes/tickets";
import statsRoutes from "./routes/stats";
import adminRoutes from "./routes/admin";
import userRoutes from "./routes/users";
import { enforceIpRules } from "./middleware/ipRules";
import { queueApiRequestLog } from "./services/requestLog";
import { readAuthIfPresent } from "./middleware/readAuthIfPresent";
import { requireStaff } from "./middleware/auth";

export const app = express();

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1200, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 25, standardHeaders: true, legacyHeaders: false });
const domainCheckLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const reportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false });
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false });
const sseLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const exportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", env.corsOrigin],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(attachRequestContext);
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(globalLimiter);
app.use(readAuthIfPresent);
app.use(enforceIpRules);
app.use((req, res, next) => {
  res.on("finish", () => queueApiRequestLog(req, res));
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "trustlens-server", timestamp: new Date().toISOString() });
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/domain/check", domainCheckLimiter);
app.use("/api/domain/report", reportLimiter);
app.use(/^\/api\/domain\/[^/]+\/verify-(request|check)$/, verificationLimiter);
app.use("/api/admin/realtime/stream", sseLimiter);
app.use("/api/admin/export", exportLimiter);
app.use("/api/admin", adminLimiter, requireStaff);

app.use("/api/auth", authRoutes);
app.use("/api/domain", domainRoutes);
app.use("/api/domain", reportRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", userRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found", requestId: res.locals.requestId });
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = req.requestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const statusCode = Number((err as Error & { statusCode?: number }).statusCode || 500);
  console.error(
    JSON.stringify({
      requestId,
      statusCode,
      message: err.message,
      stack: env.nodeEnv === "production" ? undefined : err.stack,
      path: req.path,
      method: req.method,
      at: new Date().toISOString()
    })
  );

  const safeMessage = statusCode >= 500 && env.nodeEnv === "production" ? "Internal server error" : err.message || "Unexpected error";
  res.status(statusCode).json({ error: safeMessage, requestId });
});
