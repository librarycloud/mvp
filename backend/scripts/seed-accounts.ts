import "dotenv/config";
import { loadConfig } from "../src/config/app-config.js";
import { createPrismaClient } from "../src/infrastructure/database/prisma.js";
import { STANDARD_ACCOUNTS } from "../src/modules/account/account.seed-data.js";

const config = loadConfig();
const prisma = createPrismaClient(config.databaseUrl);

try {
  const inserted = await prisma.$transaction(async (tx) => {
    const existing = await tx.account.findMany({
      where: { code: { in: STANDARD_ACCOUNTS.map((account) => account.code) } },
      select: { id: true, code: true, parentId: true, level: true },
    });
    const byCode = new Map(existing.map((account) => [account.code, account]));
    const parentCodes = new Set(STANDARD_ACCOUNTS.flatMap((account) => account.parentCode ? [account.parentCode] : []));
    let count = 0;

    for (const [index, account] of STANDARD_ACCOUNTS.entries()) {
      const parent = account.parentCode ? byCode.get(account.parentCode) : undefined;
      if (account.parentCode && !parent) {
        throw new Error(`Missing parent account ${account.parentCode} for ${account.code}`);
      }
      const current = byCode.get(account.code);
      if (current) {
        const hierarchyChanged = account.parentCode && (current.parentId !== parent!.id || current.level !== parent!.level + 1);
        if (hierarchyChanged || parentCodes.has(account.code)) {
          const updated = await tx.account.update({
            where: { id: current.id },
            data: {
              ...(account.parentCode ? { parentId: parent!.id, level: parent!.level + 1 } : {}),
              ...(parentCodes.has(account.code) ? { isLeaf: false } : {}),
              isEnabled: true,
              isSystem: true,
              deletedAt: null,
            },
            select: { id: true, code: true, parentId: true, level: true },
          });
          byCode.set(updated.code, updated);
        }
        continue;
      }

      const { parentCode: _parentCode, ...data } = account;
      const created = await tx.account.create({
        data: {
          ...data,
          parentId: parent?.id ?? null,
          level: parent ? parent.level + 1 : 1,
          isLeaf: true,
          isEnabled: true,
          isSystem: true,
          sortOrder: (index + 1) * 10,
        },
        select: { id: true, code: true, parentId: true, level: true },
      });
      byCode.set(created.code, created);
      count++;
    }

    await tx.account.updateMany({ where: { code: { in: [...parentCodes] } }, data: { isLeaf: false } });
    return count;
  });
  console.log(`Standard accounts ready: ${inserted} inserted, existing codes retained.`);
} finally {
  await prisma.$disconnect();
}
