import { Role, ApiPlan } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      authUser?: {
        id: string;
        role: Role;
      };
      apiKeyMeta?: {
        id: string;
        tier: ApiPlan;
      };
    }
  }
}

export {};
