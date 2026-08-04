import "dotenv/config";
import { loadConfig } from "../src/config/app-config.js";
import { createPrismaClient } from "../src/infrastructure/database/prisma.js";
import { BcryptPasswordHasher } from "../src/modules/auth/password-hasher.js";
import { USER_STATUS } from "../src/common/status-codes.js";

const config = loadConfig();
const username = process.env.ADMIN_USERNAME?.trim() || "admin";
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
}

const prisma = createPrismaClient(config.databaseUrl);
const passwordHash = await new BcryptPasswordHasher().hash(password);

try {
  const user = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      displayName: "系统管理员",
      role: "ADMIN",
      status: USER_STATUS.ACTIVE,
      deletedAt: null,
    },
    create: {
      username,
      passwordHash,
      displayName: "系统管理员",
      role: "ADMIN",
      status: USER_STATUS.ACTIVE,
    },
    select: { id: true, username: true },
  });
  console.log(`Administrator is ready: ${user.username} (${user.id})`);
} finally {
  await prisma.$disconnect();
}
