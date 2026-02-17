import test from "node:test";
import assert from "node:assert/strict";
import { createAdminAuditLog } from "../services/auditLog";
import { prisma } from "../lib/prisma";

test("createAdminAuditLog writes action with metadata", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const original = prisma.adminAuditLog.create;

  (prisma.adminAuditLog.create as unknown as (args: Record<string, unknown>) => Promise<unknown>) = async (args) => {
    calls.push(args);
    return {} as never;
  };

  try {
    await createAdminAuditLog({
      req: {
        ip: "127.0.0.1",
        headers: {},
        get: () => "node-test"
      } as never,
      actorUserId: "u_test",
      action: "TEST_ACTION",
      targetType: "TEST",
      targetId: "t1",
      metadata: { before: "a", after: "b" }
    });
  } finally {
    prisma.adminAuditLog.create = original;
  }

  assert.equal(calls.length, 1);
  const input = calls[0] as { data: Record<string, unknown> };
  assert.equal(input.data.action, "TEST_ACTION");
  assert.equal(input.data.targetType, "TEST");
});

