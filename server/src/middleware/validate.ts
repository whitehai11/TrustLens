import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: err.errors, requestId: req.requestId });
      }
      return res.status(400).json({ error: "Invalid request", requestId: req.requestId });
    }
  };
}
