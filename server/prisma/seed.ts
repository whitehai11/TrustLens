import { PrismaClient, ApiKeyStatus, ApiPlan, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { generateApiKey, getApiKeyParts, hashApiKey } from "../src/lib/security";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  await prisma.planLimit.upsert({ where: { plan: ApiPlan.FREE }, update: { requestsPerDay: 200 }, create: { plan: ApiPlan.FREE, requestsPerDay: 200 } });
  await prisma.planLimit.upsert({ where: { plan: ApiPlan.RESEARCH }, update: { requestsPerDay: 5000 }, create: { plan: ApiPlan.RESEARCH, requestsPerDay: 5000 } });
  await prisma.planLimit.upsert({ where: { plan: ApiPlan.BUSINESS }, update: { requestsPerDay: 50000 }, create: { plan: ApiPlan.BUSINESS, requestsPerDay: 50000 } });

  const adminEmail = process.env.ADMIN_EMAIL || "admin@trustlens.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN, status: UserStatus.ACTIVE, passwordHash },
    create: { email: adminEmail, role: Role.ADMIN, status: UserStatus.ACTIVE, passwordHash }
  });

  const moderatorEmail = process.env.MODERATOR_EMAIL || "moderator@trustlens.local";
  const moderatorPassword = process.env.MODERATOR_PASSWORD || "ChangeMe123!";
  const moderatorPasswordHash = await bcrypt.hash(moderatorPassword, 10);

  await prisma.user.upsert({
    where: { email: moderatorEmail },
    update: { role: Role.MODERATOR, status: UserStatus.ACTIVE, passwordHash: moderatorPasswordHash },
    create: { email: moderatorEmail, role: Role.MODERATOR, status: UserStatus.ACTIVE, passwordHash: moderatorPasswordHash }
  });

  const systemActorId = process.env.SYSTEM_ACTOR_USER_ID || "system";
  const systemPasswordHash = await bcrypt.hash("SystemActor!123", 10);
  await prisma.user.upsert({
    where: { email: "system@trustlens.local" },
    update: { role: Role.SUPERADMIN, status: UserStatus.ACTIVE, passwordHash: systemPasswordHash },
    create: {
      id: systemActorId,
      email: "system@trustlens.local",
      role: Role.SUPERADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: systemPasswordHash
    }
  });

  const adminFreeKey = await prisma.apiKey.findFirst({ where: { userId: admin.id, tier: ApiPlan.FREE } });
  if (!adminFreeKey) {
    const fullKey = generateApiKey();
    const { prefix, last4 } = getApiKeyParts(fullKey);
    const hash = await hashApiKey(fullKey);
    await prisma.apiKey.create({
      data: {
        userId: admin.id,
        tier: ApiPlan.FREE,
        status: ApiKeyStatus.ACTIVE,
        dailyLimit: 200,
        prefix,
        last4,
        hash
      }
    });
  }

  console.log(`Admin ready: ${adminEmail}`);
  console.log(`Moderator ready: ${moderatorEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
